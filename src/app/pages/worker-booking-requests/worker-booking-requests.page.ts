import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, UserProfile } from '../../services/auth.service';
import { BookingService, BookingData } from '../../services/booking.service';
import { ToastController, AlertController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { Firestore, collection, getDocs } from '@angular/fire/firestore';

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

  constructor(
    private router: Router,
    private authService: AuthService,
    private bookingService: BookingService,
    private toastController: ToastController,
    private alertController: AlertController,
    private firestore: Firestore
  ) {}

  async ngOnInit() {
    this.userProfile = await this.authService.getCurrentUserProfile();

    if (this.userProfile && this.userProfile.uid) {
      console.log('👤 Worker profile loaded:', this.userProfile);
      await this.debugExistingBookings(); // Debug function
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
        next: (bookings) => {
          console.log('📥 Received bookings:', bookings);
          console.log('📊 Number of bookings:', bookings.length);
          if (bookings.length > 0) {
            console.log('📋 First booking details:', bookings[0]);
          }
          this.bookings = bookings;
          this.loading = false;
        },
        error: (error) => {
          console.error('❌ Error loading pending bookings:', error);
          this.showToast('Error loading booking requests', 'danger');
          this.loading = false;
        },
      });
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
    return 'assets/icon/default-avatar.png';
  }

  getServiceName(booking: BookingData): string {
    return (
      booking.neededService ||
      booking.title ||
      booking.category ||
      'Service Request'
    );
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
}
