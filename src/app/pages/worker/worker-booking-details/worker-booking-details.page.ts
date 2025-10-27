import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { 
  Firestore, 
  doc, 
  getDoc, 
  updateDoc, 
  onSnapshot, 
  Timestamp,
  collection,
  addDoc
} from '@angular/fire/firestore';
import { 
  AlertController, 
  ToastController, 
  ActionSheetController,
  LoadingController
} from '@ionic/angular';
import { AuthService } from '../../../services/auth.service';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Subscription } from 'rxjs';

interface BookingDetails {
  id: string;
  clientId: string;
  categoryName: string;
  subService: string;
  location: {
    lat: number;
    lng: number;
    address: string;
    city?: string;
    province?: string;
  };
  pricing: {
    basePrice: number;
    serviceCharge: number;
    total: number;
  };
  status: 'accepted' | 'on-the-way' | 'arrived' | 'in-progress' | 'completed' | 'cancelled';
  assignedWorker: string;
  workerDetails: {
    id: string;
    name: string;
    phone: string;
    rating: number;
  };
  clientDetails?: {
    name: string;
    phone: string;
    email: string;
    profilePicture?: string;
    address?: string;
    verified?: boolean;
  };
  createdAt: any;
  acceptedAt?: any;
  startedAt?: any;
  completedAt?: any;
  jobTimer?: {
    startTime: any;
    endTime?: any;
    duration?: number;
  };
  completionPhoto?: string;
  finalPricing?: {
    basePrice: number;
    serviceCharge: number;
    transportFee: number;
    total: number;
    pricingType: string;
    duration: number;
    originalBasePrice: number;
  };
  rating?: {
    score: number;
    comment: string;
  };
}

interface ReportData {
  type: string;
  description: string;
  photo?: string;
  timestamp: any;
  bookingId: string;
  reportedBy: string;
}

@Component({
  selector: 'app-worker-booking-details',
  templateUrl: './worker-booking-details.page.html',
  styleUrls: ['./worker-booking-details.page.scss'],
  standalone: false,
})
export class WorkerBookingDetailsPage implements OnInit, OnDestroy {
  booking: BookingDetails | null = null;
  bookingId: string = '';
  isQuickBooking: boolean = false;
  isLoading: boolean = true;
  
  // Progress tracking
  showArrivedSlider: boolean = false;
  showCompletionSlider: boolean = false;
  showCompletionModal: boolean = false;
  completionPhoto: string = '';
  
  // Price breakdown modal
  showPriceBreakdownModal: boolean = false;
  calculatedPricing: any = null;
  
  // Timer
  jobTimer: any = null;
  elapsedTime: string = '00:00:00';
  
  // Service location address from Nominatim
  serviceLocationAddress: string = 'Loading location...';
  isLoadingServiceAddress: boolean = false;
  serviceLocationDetails: {
    formattedAddress?: string;
    street?: string;
    barangay?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    nearbyLandmark?: string;
  } | null = null;
  
  private bookingSubscription?: Subscription;
  
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private firestore: Firestore,
    private alertController: AlertController,
    private toastController: ToastController,
    private actionSheetController: ActionSheetController,
    private loadingController: LoadingController,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.bookingId = this.route.snapshot.queryParamMap.get('bookingId') || '';
    this.isQuickBooking = this.route.snapshot.queryParamMap.get('type') === 'quick';
    
    if (this.bookingId) {
      await this.loadBookingDetails();
      this.setupRealtimeListener();
    } else {
      this.router.navigate(['/pages/worker/dashboard']);
    }
  }
  
  ngOnDestroy() {
    if (this.bookingSubscription) {
      this.bookingSubscription.unsubscribe();
    }
    if (this.jobTimer) {
      clearInterval(this.jobTimer);
    }
  }
  
  async loadBookingDetails() {
    try {
      let bookingDoc: any = null;
      let actualCollectionName = '';
      
      // Try the expected collection first
      const primaryCollection = this.isQuickBooking ? 'quickbookings' : 'bookings';
      const primaryRef = doc(this.firestore, primaryCollection, this.bookingId);
      bookingDoc = await getDoc(primaryRef);
      
      if (bookingDoc.exists()) {
        actualCollectionName = primaryCollection;
      } else {
        // If not found, try the other collection
        const secondaryCollection = this.isQuickBooking ? 'bookings' : 'quickbookings';
        const secondaryRef = doc(this.firestore, secondaryCollection, this.bookingId);
        bookingDoc = await getDoc(secondaryRef);
        
        if (bookingDoc.exists()) {
          actualCollectionName = secondaryCollection;
          // Update the isQuickBooking flag based on where we found it
          this.isQuickBooking = secondaryCollection === 'quickbookings';
        }
      }
      
      if (bookingDoc && bookingDoc.exists()) {
        this.booking = { id: bookingDoc.id, ...bookingDoc.data() } as BookingDetails;
        
        console.log(`Booking found in ${actualCollectionName} collection`);
        
        // Load client details
        console.log('Booking data loaded:', this.booking);
        console.log('Booking status:', this.booking.status);
        console.log('Client ID found:', this.booking.clientId);
        
        // Check if booking status is incorrectly set to completed when it should be accepted
        if (this.booking.status === 'completed') {
          console.warn('Booking status is completed. Checking if this is correct...');
          console.log('Completion photo:', this.booking.completionPhoto);
          console.log('Job timer:', this.booking.jobTimer);
          console.log('Completed at:', this.booking.completedAt);
          console.log('Final pricing:', this.booking.finalPricing);
          
          // Check if this is a legitimate completion or an error
          const hasCompletionData = this.booking.completionPhoto || 
                                   this.booking.completedAt || 
                                   this.booking.finalPricing ||
                                   this.booking.jobTimer?.endTime;
          
          if (!hasCompletionData) {
            console.error('❌ BOOKING STATUS ERROR: Status is completed but no completion data found!');
            console.log('🔧 Attempting to fix booking status to accepted...');
            
            // Reset status to accepted if it seems to be incorrectly set
            try {
              await this.updateBookingStatus('accepted');
              this.booking.status = 'accepted';
              console.log('✅ Booking status successfully reset to accepted');
              this.showToast('Booking status corrected', 'success');
            } catch (error) {
              console.error('❌ Failed to reset booking status:', error);
              this.showToast('Error correcting booking status', 'danger');
            }
          } else {
            console.log('✅ Booking completion appears legitimate');
          }
        }
        
        if (this.booking.clientId) {
          console.log('Loading client details from users collection...');
          await this.loadClientDetails();
        } else {
          console.log('No clientId found, checking for embedded client details...');
          // Check if client details are embedded in the booking document
          this.checkEmbeddedClientDetails();
        }
        
        // Final check - if still no client details, set default
        if (!this.booking.clientDetails || !this.booking.clientDetails.name || this.booking.clientDetails.name === 'Client') {
          console.warn('Client details still not loaded, setting fallback...');
          this.booking.clientDetails = {
            name: 'Client Name Not Available',
            phone: 'Phone Not Available',
            email: 'Email Not Available',
            profilePicture: '',
            address: 'Address Not Available',
            verified: false
          };
          this.cdr.detectChanges();
        }

        // Fetch service location address from Nominatim
        if (this.booking.location?.lat && this.booking.location?.lng) {
          console.log('Fetching service location address...');
          this.fetchServiceLocationAddress(
            this.booking.location.lat,
            this.booking.location.lng
          );
        }
        
        // Start timer if job is in progress
        if (this.booking.status === 'in-progress' && this.booking.jobTimer?.startTime) {
          this.startJobTimer();
        }
      } else {
        console.error(`Booking ${this.bookingId} not found in either collection`);
        this.showToast('Booking not found in any collection', 'danger');
        this.router.navigate(['/pages/worker/dashboard']);
      }
    } catch (error) {
      console.error('Error loading booking details:', error);
      this.showToast('Error loading booking details', 'danger');
    } finally {
      this.isLoading = false;
    }
  }
  
  async loadClientDetails() {
    if (!this.booking?.clientId) {
      console.warn('No client ID available for booking:', this.booking?.id);
      if (this.booking) {
        this.booking.clientDetails = {
          name: 'No Client ID Found',
          phone: 'N/A',
          email: 'N/A',
          profilePicture: '',
          address: 'N/A',
          verified: false
        };
      }
      return;
    }
    
    console.log('Loading client details for client ID:', this.booking.clientId);
    
    try {
      const clientRef = doc(this.firestore, 'users', this.booking.clientId);
      console.log('Fetching client document from:', `users/${this.booking.clientId}`);
      
      const clientDoc = await getDoc(clientRef);
      console.log('Client document exists:', clientDoc.exists());
      
      if (clientDoc.exists()) {
        const clientData = clientDoc.data();
        console.log('Raw client data retrieved:', clientData);
        
        // Extract client information with detailed logging
        const name = clientData['fullName'] || clientData['displayName'] || clientData['name'] || 'Unknown Client';
        const phone = clientData['phoneNumber'] || clientData['phone'] || 'No phone';
        const email = clientData['email'] || 'No email';
        
        console.log('Extracted client info:', { name, phone, email });
        
        this.booking.clientDetails = {
          name: name,
          phone: phone,
          email: email,
          profilePicture: clientData['profilePicture'] || clientData['photoURL'] || '',
          address: clientData['address'] || 'No address',
          verified: clientData['verified'] || clientData['emailVerified'] || false
        };
        
        console.log('Final client details set:', this.booking.clientDetails);
        
        // Force change detection to update the UI
        this.cdr.detectChanges();
        console.log('UI change detection triggered');
        
      } else {
        console.warn('Client document not found for ID:', this.booking.clientId);
        console.warn('Document path attempted:', `users/${this.booking.clientId}`);
        
        // Set informative default client details if document doesn't exist
        this.booking.clientDetails = {
          name: 'Client Not Found in Database',
          phone: 'Phone Not Available',
          email: 'Email Not Available',
          profilePicture: '',
          address: 'Address Not Available',
          verified: false
        };
        this.cdr.detectChanges();
      }
    } catch (error: any) {
      console.error('Error loading client details:', error);
      console.error('Error details:', {
        message: error?.message || 'Unknown error',
        code: error?.code || 'No code',
        clientId: this.booking.clientId
      });
      
      // Set error-specific default client details
      this.booking.clientDetails = {
        name: 'Error Loading Client Info',
        phone: 'Error Loading Phone',
        email: 'Error Loading Email',
        profilePicture: '',
        address: 'Error Loading Address',
        verified: false
      };
      this.cdr.detectChanges();
    }
  }
  
  checkEmbeddedClientDetails() {
    if (!this.booking) return;
    
    console.log('Checking for embedded client details in booking document');
    
    // Check if client information is embedded in the booking document
    const bookingData = this.booking as any;
    
    if (bookingData.clientName || bookingData.clientPhone || bookingData.clientEmail) {
      this.booking.clientDetails = {
        name: bookingData.clientName || 'Client',
        phone: bookingData.clientPhone || '',
        email: bookingData.clientEmail || '',
        profilePicture: bookingData.clientProfilePicture || '',
        address: bookingData.clientAddress || '',
        verified: bookingData.clientVerified || false
      };
      
      console.log('Embedded client details found:', this.booking.clientDetails);
    } else {
      console.log('No embedded client details found');
      // Set default client details
      this.booking.clientDetails = {
        name: 'Client',
        phone: '',
        email: '',
        profilePicture: '',
        address: '',
        verified: false
      };
    }
  }
  
  setupRealtimeListener() {
    if (!this.bookingId) return;
    
    const collectionName = this.isQuickBooking ? 'quickbookings' : 'bookings';
    const bookingRef = doc(this.firestore, collectionName, this.bookingId);
    
    console.log(`Setting up real-time listener for ${collectionName} collection`);
    
    // Fix Firebase injection context warning by using the unsubscribe function directly
    this.bookingSubscription = new Subscription();
    const unsubscribe = onSnapshot(bookingRef, (doc) => {
      if (doc.exists()) {
        const updatedBooking = { id: doc.id, ...doc.data() } as BookingDetails;
        const previousStatus = this.booking?.status;
        
        // Preserve client details when updating booking data
        const existingClientDetails = this.booking?.clientDetails;
        this.booking = updatedBooking;
        
        // Restore client details if they were previously loaded
        if (existingClientDetails && existingClientDetails.name && existingClientDetails.name !== 'Loading...' && existingClientDetails.name !== 'Client') {
          console.log('Preserving existing client details:', existingClientDetails);
          this.booking.clientDetails = existingClientDetails;
        } else if (!this.booking.clientDetails && this.booking.clientId) {
          console.log('Client details lost in real-time update, reloading...');
          // Reload client details if they were lost
          this.loadClientDetails();
        }
        
        // Handle status changes
        if (previousStatus !== updatedBooking.status) {
          this.handleStatusChange(updatedBooking.status, previousStatus);
        }
      }
    });
    
    this.bookingSubscription.add(() => unsubscribe());
  }
  
  handleStatusChange(newStatus: string, previousStatus?: string) {
    switch (newStatus) {
      case 'in-progress':
        if (previousStatus === 'arrived') {
          this.startJobTimer();
          this.showToast('Job started! Timer is now running.', 'success');
        }
        break;
      case 'completed':
        if (this.jobTimer) {
          clearInterval(this.jobTimer);
        }
        this.showToast('Job completed successfully!', 'success');
        break;
    }
  }
  
  // SMS Messaging
  async sendMessage() {
    if (!this.booking?.clientDetails?.phone) {
      this.showToast('Client phone number not available', 'danger');
      return;
    }
    
    const workerName = this.booking.workerDetails?.name || 'Your HandyHome Worker';
    const message = `Hi! I'm ${workerName}, and I've accepted your ${this.booking.subService} booking. I'm getting ready to head your way. Thank you for choosing HandyHome! 🔧✨`;
    
    try {
      // Use SMS URL scheme for mobile devices
      const smsUrl = `sms:${this.booking.clientDetails.phone}?body=${encodeURIComponent(message)}`;
      window.open(smsUrl, '_system');
      this.showToast('SMS app opened with message template', 'success');
    } catch (error) {
      console.error('Error opening SMS app:', error);
      this.showToast('Could not open SMS app. Please try calling instead.', 'danger');
    }
  }
  
  // Call functionality
  async callClient() {
    if (!this.booking?.clientDetails?.phone) {
      this.showToast('Client phone number not available', 'danger');
      return;
    }
    
    try {
      // Use tel URL scheme to open phone app
      const telUrl = `tel:${this.booking.clientDetails.phone}`;
      window.open(telUrl, '_system');
      this.showToast('Phone app opened', 'success');
    } catch (error) {
      console.error('Error opening phone app:', error);
      this.showToast('Could not open phone app', 'danger');
    }
  }
  
  // Report functionality
  async showReportOptions() {
    const actionSheet = await this.actionSheetController.create({
      header: 'Report Issue',
      buttons: [
        {
          text: 'Client Issue',
          icon: 'person-outline',
          handler: () => this.createReport('client_issue')
        },
        {
          text: 'Location Issue',
          icon: 'location-outline',
          handler: () => this.createReport('location_issue')
        },
        {
          text: 'Safety Concern',
          icon: 'shield-outline',
          handler: () => this.createReport('safety_concern')
        },
        {
          text: 'Equipment Issue',
          icon: 'construct-outline',
          handler: () => this.createReport('equipment_issue')
        },
        {
          text: 'Other',
          icon: 'help-outline',
          handler: () => this.createReport('other')
        },
        {
          text: 'Cancel',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });
    
    await actionSheet.present();
  }
  
  async createReport(type: string) {
    const alert = await this.alertController.create({
      header: 'Report Details',
      message: `Please describe the ${type.replace('_', ' ')}:`,
      inputs: [
        {
          name: 'description',
          type: 'textarea',
          placeholder: 'Describe the issue in detail...'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Add Photo',
          handler: async (data) => {
            if (data.description.trim()) {
              await this.addPhotoToReport(type, data.description);
            } else {
              this.showToast('Please provide a description', 'danger');
            }
            return false;
          }
        },
        {
          text: 'Submit',
          handler: async (data) => {
            if (data.description.trim()) {
              await this.submitReport(type, data.description);
              return true;
            } else {
              this.showToast('Please provide a description', 'danger');
              return false;
            }
          }
        }
      ]
    });
    
    await alert.present();
  }
  
  async addPhotoToReport(type: string, description: string) {
    try {
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });
      
      await this.submitReport(type, description, image.dataUrl);
    } catch (error) {
      console.error('Error taking photo:', error);
      this.showToast('Could not take photo', 'danger');
    }
  }
  
  async submitReport(type: string, description: string, photo?: string) {
    try {
      const loading = await this.loadingController.create({
        message: 'Submitting report...'
      });
      await loading.present();
      
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) return;
      
      const reportData: ReportData = {
        type,
        description,
        photo,
        timestamp: Timestamp.now(),
        bookingId: this.bookingId,
        reportedBy: currentUser.uid
      };
      
      await addDoc(collection(this.firestore, 'reports'), reportData);
      
      await loading.dismiss();
      this.showToast('Report submitted successfully', 'success');
    } catch (error) {
      console.error('Error submitting report:', error);
      this.showToast('Error submitting report', 'danger');
    }
  }
  
  // Google Maps directions
  getDirections() {
    if (!this.booking?.location) {
      this.showToast('Location not available', 'danger');
      return;
    }
    
    const { lat, lng } = this.booking.location;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(mapsUrl, '_system');
  }
  
  // Progress tracking methods
  async updateStatusToOnTheWay() {
    await this.updateBookingStatus('on-the-way');
    this.showArrivedSlider = true;
    this.showToast('Status updated: On the way', 'success');
  }
  
  async markAsArrived() {
    await this.updateBookingStatus('arrived');
    this.showArrivedSlider = false;
    this.showToast('Status updated: Arrived at location', 'success');
  }
  
  async startJob() {
    console.log('=== STARTING JOB ===');
    console.log('Collection type:', this.isQuickBooking ? 'quickbookings' : 'bookings');
    console.log('Booking ID:', this.bookingId);
    
    const startTime = Timestamp.now();
    const jobTimer = {
      startTime: startTime
    };
    
    console.log('Job timer object to save:', jobTimer);
    console.log('Start time:', startTime);
    console.log('Start time milliseconds:', startTime.toMillis());
    
    try {
      await this.updateBookingStatus('in-progress', { jobTimer });
      console.log('Booking status updated to in-progress with job timer');
      
      this.startJobTimer();
      this.showCompletionSlider = true;
      this.showToast('Job started! Timer is running.', 'success');
    } catch (error) {
      console.error('Error starting job:', error);
      this.showToast('Error starting job', 'danger');
    }
  }
  
  async completeJob() {
    this.showCompletionSlider = false;
    this.showCompletionModal = true;
  }
  
  async takeCompletionPhoto() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });
      
      this.completionPhoto = image.dataUrl || '';
    } catch (error) {
      console.error('Error taking photo:', error);
      this.showToast('Could not take photo', 'danger');
    }
  }
  
  async submitCompletion() {
    if (!this.completionPhoto) {
      this.showToast('Please take a completion photo', 'danger');
      return;
    }
    
    const loading = await this.loadingController.create({
      message: 'Completing job...'
    });
    await loading.present();
    
    try {
      const endTime = Timestamp.now();
      const startTime = this.booking?.jobTimer?.startTime;
      console.log('=== DURATION CALCULATION ===');
      console.log('End time:', endTime);
      console.log('Start time from booking:', startTime);
      console.log('Job timer object:', this.booking?.jobTimer);
      
      const duration = startTime ? (endTime.toMillis() - startTime.toMillis()) / 1000 : 0;
      console.log('Calculated duration in seconds:', duration);
      console.log('Duration in minutes:', duration / 60);
      console.log('Duration in hours:', duration / 3600);
      
      // Calculate dynamic pricing based on job duration
      const dynamicPricing = await this.calculateDynamicPricing(duration);
      
      const jobTimer = {
        ...this.booking?.jobTimer,
        endTime,
        duration
      };
      
      console.log('=== SAVING JOB COMPLETION DATA ===');
      console.log('Job Timer object to save:', jobTimer);
      console.log('Duration being saved:', duration);
      console.log('Collection type:', this.isQuickBooking ? 'quickbookings' : 'bookings');
      console.log('Booking ID:', this.bookingId);
      
      const completionData = {
        jobTimer,
        completionPhoto: this.completionPhoto,
        completedAt: endTime,
        finalPricing: dynamicPricing
      };
      
      console.log('Complete data being saved:', completionData);
      
      await this.updateBookingStatus('completed', completionData);
      
      if (this.jobTimer) {
        clearInterval(this.jobTimer);
      }
      
      await loading.dismiss();
      this.showCompletionModal = false;
      
      // Ensure duration is included in the pricing object
      if (dynamicPricing && duration > 0) {
        dynamicPricing.duration = duration;
        console.log('✅ Ensured duration is set in dynamicPricing:', dynamicPricing.duration);
      }
      
      // Show price breakdown modal
      this.calculatedPricing = dynamicPricing;
      this.showPriceBreakdownModal = true;
      console.log('=== PRICE BREAKDOWN MODAL DEBUG ===');
      console.log('Original duration passed to calculateDynamicPricing:', duration);
      console.log('Calculated pricing object:', this.calculatedPricing);
      console.log('Pricing breakdown:');
      console.log('- Base Price:', this.calculatedPricing?.basePrice);
      console.log('- Service Charge:', this.calculatedPricing?.serviceCharge);
      console.log('- Transport Fee:', this.calculatedPricing?.transportFee);
      console.log('- Total:', this.calculatedPricing?.total);
      console.log('- Worker Earnings:', this.calculatedPricing?.workerEarnings);
      console.log('- Duration in pricing object:', this.calculatedPricing?.duration);
      console.log('- Pricing Type:', this.calculatedPricing?.pricingType);
      console.log('- Duration formatted:', this.formatDuration(this.calculatedPricing?.duration || 0));
      
      // Also check the booking's jobTimer for comparison
      console.log('Booking jobTimer for comparison:', this.booking?.jobTimer);
      console.log('Booking jobTimer duration:', this.booking?.jobTimer?.duration);
      console.log('Duration in seconds:', duration);
      console.log('Start time:', startTime);
      console.log('End time:', endTime);
      console.log('Modal visible:', this.showPriceBreakdownModal);
      
    } catch (error) {
      console.error('Error completing job:', error);
      await loading.dismiss();
      this.showToast('Error completing job', 'danger');
    }
  }


  /**
   * Manual reset booking status (for debugging)
   */
  async resetBookingStatus() {
    if (!this.booking) return;
    
    try {
      await this.updateBookingStatus('accepted');
      this.booking.status = 'accepted';
      this.showToast('Booking status reset to accepted', 'success');
      console.log('Manual booking status reset completed');
    } catch (error) {
      console.error('Failed to reset booking status:', error);
      this.showToast('Error resetting booking status', 'danger');
    }
  }

  /**
   * Confirm payment - this will notify the client
   */
  async confirmPayment() {
    try {
      // Close the price breakdown modal
      this.showPriceBreakdownModal = false;
      
      // Update booking to indicate worker has confirmed payment
      await this.updateBookingStatus('payment-confirmed', {
        workerPaymentConfirmed: true,
        paymentConfirmedAt: Timestamp.now()
      });
      
      this.showToast('Payment confirmed! Client will be notified.', 'success');
      
      // Navigate back to dashboard after a delay
      setTimeout(() => {
        this.router.navigate(['/pages/worker/dashboard']);
      }, 2000);
      
    } catch (error) {
      console.error('Error confirming payment:', error);
      this.showToast('Error confirming payment', 'danger');
    }
  }
  
  private async updateBookingStatus(status: string, additionalData?: any) {
    if (!this.booking) {
      console.error('No booking data available for status update');
      return;
    }
    
    try {
      const collectionName = this.isQuickBooking ? 'quickbookings' : 'bookings';
      const bookingRef = doc(this.firestore, collectionName, this.bookingId);
      
      const updateData: any = { status };
      if (additionalData) {
        Object.assign(updateData, additionalData);
      }
      
      console.log('Updating booking status:', status);
      console.log('Collection:', collectionName);
      console.log('Booking ID:', this.bookingId);
      console.log('Update data:', updateData);
      
      // Special logging for job completion
      if (status === 'completed' && updateData.jobTimer) {
        console.log('=== JOB COMPLETION UPDATE ===');
        console.log('JobTimer data:', updateData.jobTimer);
        console.log('Duration in jobTimer:', updateData.jobTimer.duration);
        console.log('StartTime in jobTimer:', updateData.jobTimer.startTime);
        console.log('EndTime in jobTimer:', updateData.jobTimer.endTime);
        console.log('Final pricing:', updateData.finalPricing);
      }
      
      await updateDoc(bookingRef, updateData);
      console.log('Booking status updated successfully');
      
      // Verify the update by reading back the document
      if (status === 'completed') {
        console.log('=== VERIFYING SAVED DATA ===');
        const verifyDoc = await getDoc(bookingRef);
        if (verifyDoc.exists()) {
          const savedData = verifyDoc.data();
          console.log('Saved jobTimer:', savedData['jobTimer']);
          console.log('Saved duration:', savedData['jobTimer']?.duration);
          console.log('Saved finalPricing:', savedData['finalPricing']);
        } else {
          console.error('Document not found after update!');
        }
      }
    } catch (error) {
      console.error('Error updating booking status:', error);
      this.showToast('Error updating status', 'danger');
    }
  }
  
  private startJobTimer() {
    if (!this.booking?.jobTimer?.startTime) return;
    
    this.jobTimer = setInterval(() => {
      const startTime = this.booking!.jobTimer!.startTime.toMillis();
      const currentTime = Date.now();
      const elapsed = Math.floor((currentTime - startTime) / 1000);
      
      const hours = Math.floor(elapsed / 3600);
      const minutes = Math.floor((elapsed % 3600) / 60);
      const seconds = elapsed % 60;
      
      this.elapsedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
  }
  
  // Helper methods
  formatPrice(price: number): string {
    return `₱${price.toLocaleString()}`;
  }
  
  getStatusColor(status: string): string {
    switch (status) {
      case 'accepted': return 'text-blue-600';
      case 'on-the-way': return 'text-yellow-600';
      case 'arrived': return 'text-orange-600';
      case 'in-progress': return 'text-purple-600';
      case 'completed': return 'text-green-600';
      default: return 'text-gray-600';
    }
  }
  
  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'accepted': return 'bg-blue-100 text-blue-800';
      case 'on-the-way': return 'bg-yellow-100 text-yellow-800';
      case 'arrived': return 'bg-orange-100 text-orange-800';
      case 'in-progress': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  
  private async showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }

  /**
   * Format duration from seconds to readable format
   */
  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  async calculateDynamicPricing(durationInSeconds: number): Promise<any> {
    console.log('=== CALCULATING DYNAMIC PRICING ===');
    console.log('Duration in seconds:', durationInSeconds);
    console.log('Duration in minutes:', durationInSeconds / 60);
    console.log('Duration in hours:', durationInSeconds / 3600);
    console.log('Duration formatted:', this.formatDuration(durationInSeconds));

    if (!this.booking) {
      console.error('No booking data available for pricing calculation');
      return null;
    }

    if (!durationInSeconds || durationInSeconds <= 0) {
      console.error('❌ Invalid duration provided to calculateDynamicPricing:', durationInSeconds);
      return null;
    }

    try {
      // Get service category details to check pricing type
      const categoryId = (this.booking as any).categoryId;
      if (!categoryId) {
        console.error('No category ID found in booking');
        return this.booking.pricing;
      }

      const categoryRef = doc(this.firestore, 'serviceCategories', categoryId);
      const categoryDoc = await getDoc(categoryRef);
      
      if (!categoryDoc.exists()) {
        console.error('Service category not found');
        return this.booking.pricing;
      }
      
      const categoryData = categoryDoc.data();
      const services = categoryData['services'] || [];
      
      // Find the specific sub-service
      const subService = services.find((service: any) => service.name === (this.booking as any).subService);
      
      if (!subService) {
        console.error('Sub-service not found');
        return this.booking.pricing;
      }
      
      console.log('Sub-service data:', subService);
      console.log('Job duration in seconds:', durationInSeconds);
      
      const basePrice = subService.price || this.booking.pricing?.basePrice || 0;
      const pricingType = subService.pricingType || 'fixed'; // 'fixed', 'hourly', 'daily'
      
      let calculatedBasePrice = basePrice;
      
      if (pricingType === 'hourly' || pricingType === '/hr') {
        // Calculate hourly rate
        const hoursWorked = durationInSeconds / 3600; // Convert seconds to hours
        const minimumHours = 1; // Minimum 1 hour charge
        const billableHours = Math.max(hoursWorked, minimumHours);
        
        // Round up to nearest 0.5 hour for fair billing
        const roundedHours = Math.ceil(billableHours * 2) / 2;
        calculatedBasePrice = basePrice * roundedHours;
        
        console.log(`Hourly calculation: ${roundedHours} hours × ₱${basePrice} = ₱${calculatedBasePrice}`);
        
      } else if (pricingType === 'daily' || pricingType === '/day') {
        // Calculate daily rate
        const hoursWorked = durationInSeconds / 3600;
        const daysWorked = hoursWorked / 8; // Assuming 8-hour work day
        const minimumDays = 0.5; // Minimum half-day charge
        const billableDays = Math.max(daysWorked, minimumDays);
        
        // Round up to nearest 0.5 day for fair billing
        const roundedDays = Math.ceil(billableDays * 2) / 2;
        calculatedBasePrice = basePrice * roundedDays;
        
        console.log(`Daily calculation: ${roundedDays} days × ₱${basePrice} = ₱${calculatedBasePrice}`);
        
      } else {
        // Fixed pricing - use original base price
        calculatedBasePrice = basePrice;
        console.log(`Fixed pricing: ₱${calculatedBasePrice}`);
      }
      
      // Calculate other fees
      const serviceCharge = calculatedBasePrice * 0.10; // 10% service charge
      const transportFee = 50; // Fixed transport fee as requested
      const total = calculatedBasePrice + serviceCharge + transportFee;
      
      // Worker earnings = base price + transport fee (no service charge for worker)
      const workerEarnings = calculatedBasePrice + transportFee;
      
      const dynamicPricing = {
        basePrice: calculatedBasePrice,
        serviceCharge: serviceCharge,
        transportFee: transportFee,
        total: total,
        workerEarnings: workerEarnings,
        pricingType: pricingType,
        duration: durationInSeconds,
        originalBasePrice: this.booking.pricing?.basePrice || 0
      };
      
      console.log('Dynamic pricing calculated:', dynamicPricing);
      return dynamicPricing;
      
    } catch (error) {
      console.error('Error calculating dynamic pricing:', error);
      return this.booking?.pricing || null;
    }
  }

  /**
   * Fetch precise service location address from Nominatim with detailed parsing
   */
  async fetchServiceLocationAddress(lat: number, lng: number): Promise<void> {
    if (lat === 0 && lng === 0) {
      this.serviceLocationAddress = 'Location not available';
      this.serviceLocationDetails = null;
      return;
    }

    this.isLoadingServiceAddress = true;
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;

    try {
      console.log('Fetching precise service location address from Nominatim...');
      console.log('Coordinates:', { lat, lng });
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'HandyHome/1.0'
        }
      });
      const data = await response.json();

      console.log('Nominatim response for service location:', data);

      if (data && data.address) {
        const addr = data.address;
        console.log('Address components:', addr);

        // Parse detailed address components
        const street = addr.road || addr.street || '';
        const houseNumber = addr.house_number || '';
        const barangay = addr.suburb || addr.neighbourhood || addr.village || '';
        const city = addr.city || addr.town || addr.municipality || '';
        const province = addr.state || addr.province || '';
        const postalCode = addr.postcode || '';
        
        // Build street address with house number
        let fullStreet = '';
        if (houseNumber && street) {
          fullStreet = `${houseNumber} ${street}`;
        } else if (street) {
          fullStreet = street;
        }
        
        // Find nearby landmark from amenity, shop, or building
        let nearbyLandmark = '';
        if (addr.amenity) {
          nearbyLandmark = `Near ${addr.amenity}`;
        } else if (addr.shop) {
          nearbyLandmark = `Near ${addr.shop}`;
        } else if (addr.building && addr.building !== 'yes') {
          nearbyLandmark = `Near ${addr.building}`;
        } else if (addr.tourism) {
          nearbyLandmark = `Near ${addr.tourism}`;
        }

        // Store detailed address components
        this.serviceLocationDetails = {
          formattedAddress: data.display_name,
          street: fullStreet || undefined,
          barangay: barangay || undefined,
          city: city || undefined,
          province: province || undefined,
          postalCode: postalCode || undefined,
          nearbyLandmark: nearbyLandmark || undefined,
        };

        // Build a more structured address for display
        let structuredAddress = '';
        if (fullStreet) {
          structuredAddress += fullStreet;
        }
        if (barangay) {
          structuredAddress += (structuredAddress ? ', ' : '') + `Barangay ${barangay}`;
        }
        if (city) {
          structuredAddress += (structuredAddress ? ', ' : '') + city;
        }
        if (province) {
          structuredAddress += (structuredAddress ? ', ' : '') + province;
        }
        if (postalCode) {
          structuredAddress += ` ${postalCode}`;
        }

        this.serviceLocationAddress = structuredAddress || data.display_name;
        
        console.log('Parsed service location details:', this.serviceLocationDetails);
        console.log('Structured address:', this.serviceLocationAddress);
        
      } else {
        this.serviceLocationAddress = 'Address not available';
        this.serviceLocationDetails = null;
      }
    } catch (error) {
      console.error('Error fetching service location address:', error);
      this.serviceLocationAddress = 'Unable to fetch address';
      this.serviceLocationDetails = null;
    } finally {
      this.isLoadingServiceAddress = false;
    }
  }
  
  goBack() {
    this.router.navigate(['/pages/worker/dashboard']);
  }
}
