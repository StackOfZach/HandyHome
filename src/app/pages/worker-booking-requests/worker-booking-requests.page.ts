import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, UserProfile } from '../../services/auth.service';
import { BookingService, BookingData } from '../../services/booking.service';
import { ToastController, AlertController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { Firestore, collection, getDocs, doc, getDoc, query, where } from '@angular/fire/firestore';

@Component({
  selector: 'app-worker-booking-requests',
  templateUrl: './worker-booking-requests.page.html',
  styleUrls: ['./worker-booking-requests.page.scss'],
  standalone: false,
})
export class WorkerBookingRequestsPage implements OnInit, OnDestroy {
  bookings: BookingData[] = [];
  loading: boolean = true;
  userProfile: UserProfile | null = null;
  private bookingsSubscription?: Subscription;
  private clientProfileImages: { [clientId: string]: string } = {};

  private firestore = inject(Firestore);

  constructor(
    private router: Router,
    private authService: AuthService,
    private bookingService: BookingService,
    private toastController: ToastController,
    private alertController: AlertController,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.userProfile = await this.authService.getCurrentUserProfile();

    if (this.userProfile && this.userProfile.uid) {
      console.log('👤 Worker profile loaded:', this.userProfile);
      await this.debugExistingBookings(); // Debug function
      await this.debugCollections(); // Debug collections
      this.loadPendingBookings();
    } else {
      console.log('❌ No user profile found');
      this.showToast('Please login to view booking requests', 'danger');
      this.router.navigate(['/pages/auth/login']);
    }
  }

  // Debug function to check all bookings in database
  async debugExistingBookings() {
    try {
      console.log('🔍 Checking all bookings in database...');
      const bookingsRef = collection(this.firestore, 'bookings');
      const snapshot = await getDocs(bookingsRef);

      console.log('📊 Total bookings in database:', snapshot.size);

      snapshot.forEach((doc: any) => {
        const data = doc.data();
        console.log('📄 Booking found:', {
          id: doc.id,
          assignedWorker: data['assignedWorker'],
          workerId: data['workerId'],
          status: data['status'],
          clientId: data['clientId'],
          neededService: data['neededService'],
          createdAt: data['createdAt'],
          updatedAt: data['updatedAt'],
        });
      });
    } catch (error) {
      console.error('❌ Error checking bookings:', error);
    }
  }

  ngOnDestroy() {
    if (this.bookingsSubscription) {
      this.bookingsSubscription.unsubscribe();
    }
  }

  loadPendingBookings() {
    if (!this.userProfile?.uid) {
      console.log('❌ No user profile or UID found');
      return;
    }

    console.log(
      '🔍 Loading pending bookings for worker:',
      this.userProfile.uid
    );
    this.loading = true;
    this.bookingsSubscription = this.bookingService
      .getPendingBookingsForWorker$(this.userProfile.uid)
      .subscribe({
        next: async (bookings) => {
          console.log('📥 Received bookings:', bookings);
          console.log('📊 Number of bookings:', bookings.length);
          if (bookings.length > 0) {
            console.log('📋 First booking details:', bookings[0]);
          }
          this.bookings = bookings;
          
          // Fetch client profile images for all bookings
          await this.fetchClientProfileImages(bookings);
          
          this.loading = false;
        },
        error: (error) => {
          console.error('❌ Error loading pending bookings:', error);
          this.showToast('Error loading booking requests', 'danger');
          this.loading = false;
        },
      });
  }

  async fetchClientProfileImages(bookings: BookingData[]) {
    console.log('🖼️ Fetching client profile images...');
    console.log('📋 Bookings to process:', bookings.map(b => ({ id: b.id, clientId: b.clientId, clientName: b.clientName })));
    
    for (const booking of bookings) {
      if (booking.clientId && !this.clientProfileImages[booking.clientId]) {
        console.log(`🔍 Processing client ${booking.clientId}...`);
        
        try {
          // First try client-verification collection - query by userId field
          const clientVerificationRef = collection(this.firestore, 'client-verification');
          const clientVerificationQuery = query(clientVerificationRef, where('userId', '==', booking.clientId));
          const clientVerificationSnapshot = await getDocs(clientVerificationQuery);
          
          let profileImageUrl = null;
          
          if (!clientVerificationSnapshot.empty) {
            // Get the first matching document
            const clientVerificationDoc = clientVerificationSnapshot.docs[0];
            const clientData = clientVerificationDoc.data();
            console.log(`📄 Client verification data for userId ${booking.clientId}:`, {
              documentId: clientVerificationDoc.id,
              userId: clientData['userId'],
              userName: clientData['userName'],
              userEmail: clientData['userEmail'],
              status: clientData['status'],
              hasProfileImage: !!clientData['profileImageBase64'],
              profileImageLength: clientData['profileImageBase64']?.length || 0
            });
            
            // Try multiple possible field names, prioritizing profileImageBase64
            profileImageUrl = clientData['profileImageBase64'] ||
                            clientData['profileImageUrl'] || 
                            clientData['photoUrl'] || 
                            clientData['imageUrl'] ||
                            clientData['profileImage'] ||
                            clientData['photo'] ||
                            clientData['avatar'];
            
            if (profileImageUrl) {
              console.log(`✅ Found profile image in client-verification for userId ${booking.clientId}:`, profileImageUrl.substring(0, 50) + '...');
            } else {
              console.log(`⚠️ No profile image in client-verification for userId ${booking.clientId}, trying users collection...`);
            }
          } else {
            console.log(`❌ Client verification document not found for userId ${booking.clientId}, trying users collection...`);
          }
          
          // If no image found in client-verification, try users collection
          if (!profileImageUrl) {
            try {
              const userRef = doc(this.firestore, 'users', booking.clientId);
              const userDoc = await getDoc(userRef);
              
              if (userDoc.exists()) {
                const userData = userDoc.data();
                console.log(`📄 User data for ${booking.clientId}:`, userData);
                
                profileImageUrl = userData['profileImageUrl'] || 
                                userData['photoUrl'] || 
                                userData['imageUrl'] ||
                                userData['profileImage'] ||
                                userData['photo'] ||
                                userData['avatar'];
                
                if (profileImageUrl) {
                  console.log(`✅ Found profile image in users collection for ${booking.clientId}:`, profileImageUrl);
                } else {
                  console.log(`⚠️ No profile image found in users collection for ${booking.clientId}`);
                }
              } else {
                console.log(`❌ User document not found for ${booking.clientId}`);
              }
            } catch (userError) {
              console.error(`❌ Error fetching from users collection for ${booking.clientId}:`, userError);
            }
          }
          
          // Set the result
          if (profileImageUrl) {
            // Process the image URL/data
            const processedImageUrl = this.processImageData(profileImageUrl);
            this.clientProfileImages[booking.clientId] = processedImageUrl;
            console.log(`✅ Successfully cached profile image for client ${booking.clientId}:`, processedImageUrl.substring(0, 50) + '...');
          } else {
            this.clientProfileImages[booking.clientId] = 'assets/icon/default-avatar.jpg';
            console.log(`⚠️ Using default avatar for client ${booking.clientId}`);
          }
          
          // Trigger change detection to update the UI
          this.cdr.detectChanges();
          
        } catch (error) {
          console.error(`❌ Error fetching profile image for client ${booking.clientId}:`, error);
          this.clientProfileImages[booking.clientId] = 'assets/icon/default-avatar.jpg';
        }
      } else if (!booking.clientId) {
        console.log(`⚠️ Booking ${booking.id} has no clientId`);
      } else {
        console.log(`ℹ️ Profile image already cached for client ${booking.clientId}`);
      }
    }
    
    console.log('🖼️ Final client profile images cache:', this.clientProfileImages);
    
    // Final change detection after all images are processed
    this.cdr.detectChanges();
  }

  // Helper method to process image data (URL or base64)
  processImageData(imageData: string): string {
    if (!imageData) {
      return 'assets/icon/default-avatar.jpg';
    }
    
    // If it's already a complete data URI or HTTP URL, return as is
    if (imageData.startsWith('data:image/') || imageData.startsWith('http')) {
      return imageData;
    }
    
    // If it's an asset path, return as is
    if (imageData.startsWith('assets/')) {
      return imageData;
    }
    
    // Assume it's base64 data without prefix, add the data URI prefix
    // Handle both with and without leading slash
    const cleanBase64 = imageData.startsWith('/') ? imageData.substring(1) : imageData;
    return `data:image/jpeg;base64,${cleanBase64}`;
  }

  // Debug method to check collections
  async debugCollections() {
    console.log('🔍 Debugging collections...');
    
    try {
      // Check client-verification collection
      const clientVerificationRef = collection(this.firestore, 'client-verification');
      const clientVerificationSnapshot = await getDocs(clientVerificationRef);
      console.log('📊 client-verification collection size:', clientVerificationSnapshot.size);
      
      clientVerificationSnapshot.forEach((doc) => {
        console.log('📄 client-verification doc:', doc.id, doc.data());
      });
      
      // Check users collection
      const usersRef = collection(this.firestore, 'users');
      const usersSnapshot = await getDocs(usersRef);
      console.log('📊 users collection size:', usersSnapshot.size);
      
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data['role'] === 'client') {
          console.log('📄 client user doc:', doc.id, data);
        }
      });
      
    } catch (error) {
      console.error('❌ Error debugging collections:', error);
    }
  }

  async acceptBooking(bookingId: string) {
    if (!this.userProfile?.uid) return;

    const alert = await this.alertController.create({
      header: 'Accept Booking',
      message: 'Are you sure you want to accept this booking request?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Accept',
          handler: async () => {
            try {
              await this.bookingService.acceptBooking(
                bookingId,
                this.userProfile!.uid
              );
              this.showToast('Booking accepted successfully!', 'success');
              this.router.navigate([
                '/pages/worker/booking-details',
                bookingId,
              ]);
            } catch (error) {
              console.error('Error accepting booking:', error);
              this.showToast(
                'Error accepting booking. Please try again.',
                'danger'
              );
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async rejectBooking(bookingId: string) {
    const alert = await this.alertController.create({
      header: 'Reject Booking',
      message:
        'Are you sure you want to reject this booking request? This action cannot be undone.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Reject',
          handler: async () => {
            try {
              await this.bookingService.rejectBooking(bookingId);
              this.showToast('Booking rejected.', 'warning');
            } catch (error) {
              console.error('Error rejecting booking:', error);
              this.showToast(
                'Error rejecting booking. Please try again.',
                'danger'
              );
            }
          },
        },
      ],
    });

    await alert.present();
  }

  goBack() {
    this.router.navigate(['/pages/worker/dashboard']);
  }

  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'warning' = 'success'
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    toast.present();
  }

  formatScheduleDate(booking: BookingData): string {
    let date = null;

    // Check for different date formats
    if (booking.scheduleDate) {
      date = booking.scheduleDate;
    } else if (booking.schedule?.date) {
      date = new Date(booking.schedule.date);
    } else {
      date = booking.createdAt;
    }

    if (date) {
      try {
        // Handle Firestore Timestamp
        if (date && typeof date === 'object' && 'seconds' in date) {
          const jsDate = new Date((date as any).seconds * 1000);
          return jsDate.toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });
        }

        // Handle regular Date or string
        const jsDate = new Date(date);
        if (isNaN(jsDate.getTime())) {
          return 'Date not specified';
        }

        return jsDate.toLocaleDateString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      } catch (error) {
        return 'Date not specified';
      }
    }
    return 'Date not specified';
  }

  getClientName(booking: BookingData): string {
    return (
      booking.clientName ||
      `Client ${booking.clientId?.substring(0, 8) || 'Unknown'}...`
    );
  }

  getClientPhotoUrl(booking: BookingData): string {
    // First check if we have cached profile image from client-verification collection
    if (booking.clientId && this.clientProfileImages[booking.clientId]) {
      return this.clientProfileImages[booking.clientId];
    }
    
    // If not cached and clientId exists, fetch it asynchronously
    if (booking.clientId && !this.clientProfileImages[booking.clientId]) {
      this.fetchSingleClientProfileImage(booking.clientId);
    }
    
    // Fallback to booking's clientPhotoUrl if available
    if (booking.clientPhotoUrl) {
      return booking.clientPhotoUrl;
    }
    
    // Default avatar as last resort
    return 'assets/icon/default-avatar.jpg';
  }

  async fetchSingleClientProfileImage(clientId: string) {
    if (this.clientProfileImages[clientId]) {
      return; // Already cached
    }

    console.log(`🔍 Fetching single profile image for client ${clientId}...`);

    try {
      let profileImageUrl = null;
      
      // First try client-verification collection - query by userId field
      const clientVerificationRef = collection(this.firestore, 'client-verification');
      const clientVerificationQuery = query(clientVerificationRef, where('userId', '==', clientId));
      const clientVerificationSnapshot = await getDocs(clientVerificationQuery);
      
      if (!clientVerificationSnapshot.empty) {
        // Get the first matching document
        const clientVerificationDoc = clientVerificationSnapshot.docs[0];
        const clientData = clientVerificationDoc.data();
        console.log(`📄 Single fetch - Client verification data for userId ${clientId}:`, {
          documentId: clientVerificationDoc.id,
          userId: clientData['userId'],
          userName: clientData['userName'],
          userEmail: clientData['userEmail'],
          status: clientData['status'],
          hasProfileImage: !!clientData['profileImageBase64'],
          profileImageLength: clientData['profileImageBase64']?.length || 0
        });
        
        // Try multiple possible field names, prioritizing profileImageBase64
        profileImageUrl = clientData['profileImageBase64'] ||
                        clientData['profileImageUrl'] || 
                        clientData['photoUrl'] || 
                        clientData['imageUrl'] ||
                        clientData['profileImage'] ||
                        clientData['photo'] ||
                        clientData['avatar'];
        
        if (profileImageUrl) {
          console.log(`✅ Single fetch - Found profile image in client-verification for userId ${clientId}:`, profileImageUrl.substring(0, 50) + '...');
        }
      }
      
      // If no image found in client-verification, try users collection
      if (!profileImageUrl) {
        try {
          const userRef = doc(this.firestore, 'users', clientId);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log(`📄 Single fetch - User data for ${clientId}:`, userData);
            
            profileImageUrl = userData['profileImageUrl'] || 
                            userData['photoUrl'] || 
                            userData['imageUrl'] ||
                            userData['profileImage'] ||
                            userData['photo'] ||
                            userData['avatar'];
            
            if (profileImageUrl) {
              console.log(`✅ Single fetch - Found profile image in users collection for ${clientId}:`, profileImageUrl);
            }
          }
        } catch (userError) {
          console.error(`❌ Single fetch - Error fetching from users collection for ${clientId}:`, userError);
        }
      }
      
      // Set the result
      if (profileImageUrl) {
        // Process the image URL/data
        const processedImageUrl = this.processImageData(profileImageUrl);
        this.clientProfileImages[clientId] = processedImageUrl;
        console.log(`✅ Single fetch - Successfully cached profile image for client ${clientId}:`, processedImageUrl.substring(0, 50) + '...');
      } else {
        this.clientProfileImages[clientId] = 'assets/icon/default-avatar.jpg';
        console.log(`⚠️ Single fetch - Using default avatar for client ${clientId}`);
      }
      
      // Trigger change detection to update the UI
      this.cdr.detectChanges();
      
    } catch (error) {
      console.error(`❌ Single fetch - Error fetching profile image for client ${clientId}:`, error);
      this.clientProfileImages[clientId] = 'assets/icon/default-avatar.jpg';
    }
  }

  getServiceName(booking: BookingData): string {
    const mainService = booking.category || booking.neededService || booking.title || 'Service Request';
    const specificService = booking.specificService || booking.subService;
    
    // Format as "Main Service - Specific Service" if both exist
    if (mainService && specificService && mainService !== specificService) {
      return `${mainService} - ${specificService}`;
    }
    
    return mainService;
  }

  getSpecificService(booking: BookingData): string | null {
    return booking.specificService || booking.subService || null;
  }

  getPriceRange(booking: BookingData): { min: number; max: number } {
    const minBudget = booking.minBudget || booking.price || 0;
    const maxBudget =
      booking.maxBudget || booking.priceRange || booking.price || 0;

    return {
      min: minBudget,
      max: maxBudget || minBudget,
    };
  }

  getFormattedDate(date: any): string {
    if (!date) return 'Unknown date';

    try {
      // Handle Firestore Timestamp
      if (date && typeof date === 'object' && 'seconds' in date) {
        const jsDate = new Date(date.seconds * 1000);
        return jsDate.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }

      // Handle regular Date or string
      const jsDate = new Date(date);
      if (isNaN(jsDate.getTime())) {
        return 'Invalid date';
      }

      return jsDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return 'Invalid date';
    }
  }

  getPreferredTime(booking: BookingData): string {
    if (booking.schedule?.time) {
      return booking.schedule.time;
    }

    // If scheduleDate contains time info, extract it
    if (booking.scheduleDate) {
      try {
        let jsDate;
        if (
          booking.scheduleDate &&
          typeof booking.scheduleDate === 'object' &&
          'seconds' in booking.scheduleDate
        ) {
          jsDate = new Date((booking.scheduleDate as any).seconds * 1000);
        } else {
          jsDate = new Date(booking.scheduleDate);
        }

        if (!isNaN(jsDate.getTime())) {
          return jsDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          });
        }
      } catch (error) {
        console.log('Error extracting time:', error);
      }
    }

    return 'Time not specified';
  }

  getServiceLocation(booking: BookingData): string {
    // Check for different location formats
    if (booking.locations && booking.locations.length > 0) {
      return booking.locations[0].address;
    }
    
    if (booking.address) {
      return booking.address;
    }
    
    if (booking.city) {
      return booking.city + (booking.zipCode ? `, ${booking.zipCode}` : '');
    }
    
    return 'Location not specified';
  }

  getRequestDate(booking: BookingData): string {
    return this.getFormattedDate(booking.createdAt);
  }

  getPreferredSchedule(booking: BookingData): { date: string; time: string } {
    return {
      date: this.formatScheduleDate(booking),
      time: this.getPreferredTime(booking)
    };
  }
}
