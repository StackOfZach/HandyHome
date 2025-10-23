import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import {
  Firestore,
  doc,
  onSnapshot,
  updateDoc,
  Unsubscribe,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from '@angular/fire/firestore';
import { AuthService } from '../../../services/auth.service';
import { Subscription, interval } from 'rxjs';

interface BookingData {
  id: string;
  clientId: string;
  workerId: string;
  workerName: string;
  workerPhone: string;
  neededService: string;
  scheduleDate: any;
  priceRange: number;
  minBudget?: number;
  maxBudget?: number;
  status:
    | 'pending'
    | 'accepted'
    | 'on-the-way'
    | 'service-started'
    | 'awaiting-payment'
    | 'completed'
    | 'cancelled';
  createdAt: any;
  updatedAt: any;
  // Enhanced location fields
  locationType?: 'current' | 'custom' | 'saved';
  coordinates?: { lat: number; lng: number };
  address?: string;
  city?: string;
  zipCode?: string;
  // Saved location specific fields
  contactPerson?: string;
  phoneNumber?: string;
  savedLocationId?: string;
  // Payment and completion fields
  requestedAmount?: number;
  paymentStatus?: 'none' | 'requested' | 'paid';
  completionPhoto?: string;
  serviceStartedAt?: any;
  completedAt?: any;
  // Worker location tracking
  workerLocation?: { lat: number; lng: number; timestamp: any };
}

interface WorkerLocationUpdate {
  workerId: string;
  bookingId: string;
  location: { lat: number; lng: number };
  timestamp: any;
}

interface WorkerProfile {
  uid: string;
  fullName: string;
  photoUrl: string;
  rating: number;
  reviewCount: number;
  skills: string[];
  phoneNumber: string;
  verificationStatus: string;
}

@Component({
  selector: 'app-booking-progress',
  templateUrl: './booking-progress.page.html',
  styleUrls: ['./booking-progress.page.scss'],
  standalone: false,
})
export class BookingProgressPage implements OnInit, OnDestroy {
  booking: BookingData | null = null;
  worker: WorkerProfile | null = null;
  bookingId: string = '';
  currentUser: any = null;
  bookingSubscription: Unsubscribe | null = null;

  // Live location tracking
  workerLocation: { lat: number; lng: number; timestamp?: any } | null = null;
  locationTrackingActive: boolean = false;
  workerDistance: number | null = null;
  estimatedArrival: string = '';
  private locationSubscription?: Subscription;

  statusMessages = {
    pending: 'Waiting for worker to accept your booking...',
    accepted: 'Worker accepted your booking! Job is scheduled.',
    'on-the-way': 'Worker is on the way to your location!',
    'service-started': 'Worker has started the service at your location.',
    'awaiting-payment': 'Service completed. Payment requested by worker.',
    completed: 'Service completed successfully! Payment confirmed.',
    cancelled: 'Booking was cancelled.',
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private alertController: AlertController,
    private modalController: ModalController,
    private toastController: ToastController,
    private firestore: Firestore,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();

    // Get booking ID from route params
    this.route.params.subscribe((params) => {
      this.bookingId = params['bookingId'];
      if (this.bookingId) {
        this.subscribeToBookingUpdates();
      }
    });
  }

  ngOnDestroy() {
    if (this.bookingSubscription) {
      this.bookingSubscription();
    }
  }

  subscribeToBookingUpdates() {
    const bookingDocRef = doc(this.firestore, 'bookings', this.bookingId);

    this.bookingSubscription = onSnapshot(
      bookingDocRef,
      (doc) => {
        if (doc.exists()) {
          const previousStatus = this.booking?.status;

          this.booking = {
            id: doc.id,
            ...doc.data(),
          } as BookingData;

          console.log('Booking updated:', this.booking);

          // Load worker profile if not loaded
          if (this.booking.workerId && !this.worker) {
            this.loadWorkerProfile();
          }

          // Handle location tracking based on status changes
          this.handleLocationTrackingUpdate(previousStatus);

          // Update worker location if available
          if (this.booking.workerLocation && this.locationTrackingActive) {
            this.workerLocation = this.booking.workerLocation;
            this.calculateDistanceAndArrival();
          }
        }
      },
      (error) => {
        console.error('Error listening to booking updates:', error);
      }
    );
  }

  private handleLocationTrackingUpdate(previousStatus?: string) {
    if (!this.booking) return;

    const currentStatus = this.booking.status;

    // Start tracking when booking is accepted and scheduled for today
    if (
      currentStatus === 'accepted' &&
      previousStatus !== 'accepted' &&
      this.shouldTrackLocation()
    ) {
      this.startLocationTracking();
    }

    // Continue tracking for active statuses
    else if (
      ['accepted', 'on-the-way', 'service-started'].includes(currentStatus) &&
      this.shouldTrackLocation()
    ) {
      if (!this.locationTrackingActive) {
        this.startLocationTracking();
      }
    }

    // Stop tracking when job is completed or cancelled
    else if (
      ['completed', 'cancelled', 'awaiting-payment'].includes(currentStatus)
    ) {
      if (this.locationTrackingActive) {
        this.stopLocationTracking();
      }
    }
  }

  async loadWorkerProfile() {
    if (!this.booking?.workerId) return;

    try {
      // In a real app, you'd fetch worker profile from Firestore
      // For now, we'll create a mock worker based on booking data
      this.worker = {
        uid: this.booking.workerId,
        fullName: this.booking.workerName || 'HandyHome Worker',
        photoUrl: '/assets/default-avatar.png',
        rating: 4.5, // Mock rating
        reviewCount: 23, // Mock review count
        skills: ['General Repair', 'Maintenance'], // Mock skills
        phoneNumber: this.booking.workerPhone || '',
        verificationStatus: 'verified',
      };
    } catch (error) {
      console.error('Error loading worker profile:', error);
    }
  }

  async sendMessage() {
    if (!this.worker || !this.booking) return;

    const message = `Hi ${this.worker.fullName}, I am ${
      this.currentUser?.displayName || 'a client'
    } from HandyHome. I've requested a booking for ${
      this.booking.neededService
    } scheduled on ${this.booking.scheduleDate
      ?.toDate()
      .toLocaleDateString()}.`;

    // Open SMS app with prefilled message
    const smsUrl = `sms:${this.worker.phoneNumber}?body=${encodeURIComponent(
      message
    )}`;
    window.open(smsUrl, '_system');
  }

  async sendSMS() {
    this.sendMessage();
  }

  async callWorker() {
    if (!this.worker) return;

    // Open phone dialer
    const telUrl = `tel:${this.worker.phoneNumber}`;
    window.open(telUrl, '_system');
  }

  goBack() {
    this.router.navigate(['/client/worker-results']);
  }

  getProgressPercentage(): number {
    if (!this.booking) return 0;

    switch (this.booking.status) {
      case 'pending':
        return 25;
      case 'accepted':
        return 75;
      case 'completed':
        return 100;
      case 'cancelled':
        return 0;
      default:
        return 0;
    }
  }

  getCurrentStep(): string {
    if (!this.booking) return 'booking';

    switch (this.booking.status) {
      case 'pending':
        return 'matching';
      case 'accepted':
        return 'accepted';
      case 'completed':
        return 'completed';
      case 'cancelled':
        return 'booking';
      default:
        return 'booking';
    }
  }

  isStepCompleted(step: string): boolean {
    if (!this.booking) return false;

    const stepOrder = ['booking', 'matching', 'accepted', 'completed'];
    const currentIndex = stepOrder.indexOf(this.getCurrentStep());
    const stepIndex = stepOrder.indexOf(step);

    if (this.booking.status === 'cancelled') {
      return step === 'booking';
    }

    return (
      stepIndex <= currentIndex ||
      (this.booking.status === 'completed' && step !== 'completed') ||
      (this.booking.status === 'completed' && step === 'completed')
    );
  }

  async cancelBooking() {
    if (!this.booking || this.booking.status === 'accepted') return;

    const alert = await this.alertController.create({
      header: 'Cancel Booking',
      message:
        'Are you sure you want to cancel this booking? This action cannot be undone.',
      buttons: [
        {
          text: 'No, Keep Booking',
          role: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          handler: async () => {
            await this.confirmCancellation();
          },
        },
      ],
    });

    await alert.present();
  }

  async confirmCancellation() {
    try {
      await updateDoc(doc(this.firestore, 'bookings', this.bookingId), {
        status: 'cancelled',
        updatedAt: new Date(),
        cancelledBy: 'client',
        cancelledAt: new Date(),
      });

      const toast = await this.toastController.create({
        message: 'Booking cancelled successfully.',
        duration: 3000,
        color: 'success',
      });
      toast.present();

      // Navigate back to client dashboard
      this.router.navigate(['/pages/client/dashboard']);
    } catch (error) {
      console.error('Error cancelling booking:', error);

      const toast = await this.toastController.create({
        message: 'Error cancelling booking. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    }
  }

  async reportWorker() {
    const alert = await this.alertController.create({
      header: 'Report Worker',
      message: 'What would you like to report about this worker?',
      inputs: [
        {
          name: 'reason',
          type: 'textarea',
          placeholder: 'Describe the issue...',
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Submit Report',
          handler: (data) => {
            if (data.reason?.trim()) {
              this.submitReport(data.reason);
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async submitReport(reason: string) {
    try {
      // In a real app, you'd save the report to Firestore
      console.log('Report submitted:', reason);

      const toast = await this.toastController.create({
        message: 'Report submitted successfully. We will review it shortly.',
        duration: 3000,
        color: 'success',
      });
      toast.present();
    } catch (error) {
      console.error('Error submitting report:', error);

      const toast = await this.toastController.create({
        message: 'Error submitting report. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    }
  }

  getStatusColor(): string {
    if (!this.booking) return 'medium';

    switch (this.booking.status) {
      case 'pending':
        return 'warning';
      case 'accepted':
        return 'success';
      case 'completed':
        return 'primary';
      case 'cancelled':
        return 'danger';
      default:
        return 'medium';
    }
  }

  getStatusIcon(): string {
    if (!this.booking) return '/assets/icons/time.svg';

    switch (this.booking.status) {
      case 'pending':
        return '/assets/icons/time.svg';
      case 'accepted':
        return '/assets/icons/checkmark-circle.svg';
      case 'completed':
        return '/assets/icons/completed.svg';
      case 'cancelled':
        return '/assets/icons/close-circle.svg';
      default:
        return '/assets/icons/time.svg';
    }
  }

  getStarRating(rating: number): string[] {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(i <= rating ? 'star' : 'star-outline');
    }
    return stars;
  }

  getStatusMessage(): string {
    if (!this.booking?.status) return 'Loading...';
    return this.statusMessages[this.booking.status] || 'Unknown status';
  }

  getStatusDescription(): string {
    if (!this.booking?.status) return '';
    switch (this.booking.status) {
      case 'pending':
        return 'We will notify you when a worker accepts your booking';
      case 'accepted':
        return this.shouldTrackLocation()
          ? "Track your worker's location below when they start traveling"
          : 'Your worker will contact you soon';
      case 'on-the-way':
        return 'Your worker is traveling to your location. Live tracking is active.';
      case 'service-started':
        return 'Work is now in progress at your location.';
      case 'awaiting-payment':
        return 'Service completed! Please review and confirm payment.';
      case 'completed':
        return 'Thank you for using HandyHome!';
      case 'cancelled':
        return 'This booking has been cancelled.';
      default:
        return '';
    }
  }

  // Safe method to get formatted date string
  getFormattedDate(timestamp: any): string {
    try {
      if (!timestamp) {
        return 'Not scheduled';
      }

      // If it's a Firestore timestamp
      let date: Date;
      if (timestamp?.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else {
        date = new Date(timestamp);
      }

      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }

      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (error) {
      console.warn('Error formatting date:', error);
      return 'Invalid date';
    }
  }

  // ===== LIVE LOCATION TRACKING METHODS =====

  private startLocationTracking() {
    if (!this.booking?.workerId || !this.shouldTrackLocation()) {
      console.log('Location tracking not started - missing requirements');
      return;
    }

    console.log(
      'Starting live worker location tracking for booking:',
      this.bookingId
    );
    this.locationTrackingActive = true;

    // Subscribe to worker location updates from booking document
    if (this.booking.workerLocation) {
      this.workerLocation = this.booking.workerLocation;
      this.calculateDistanceAndArrival();
    }

    // Set up periodic location polling every 10 seconds
    this.locationSubscription = interval(10000).subscribe(() => {
      this.pollWorkerLocation();
    });
  }

  private stopLocationTracking() {
    console.log('Stopping location tracking');
    this.locationTrackingActive = false;
    this.locationSubscription?.unsubscribe();
    this.workerLocation = null;
    this.workerDistance = null;
    this.estimatedArrival = '';
  }

  private shouldTrackLocation(): boolean {
    if (!this.booking) return false;

    // Only track location if booking is accepted and scheduled for today
    const isAcceptedStatus = [
      'accepted',
      'on-the-way',
      'service-started',
    ].includes(this.booking.status);

    if (!isAcceptedStatus) return false;

    // Check if scheduled date is today
    if (this.booking.scheduleDate) {
      try {
        let scheduleDate: Date;
        if (this.booking.scheduleDate?.toDate) {
          scheduleDate = this.booking.scheduleDate.toDate();
        } else {
          scheduleDate = new Date(this.booking.scheduleDate);
        }

        const today = new Date();
        const isToday = scheduleDate.toDateString() === today.toDateString();

        console.log(
          'Schedule date:',
          scheduleDate.toDateString(),
          'Today:',
          today.toDateString(),
          'Is today:',
          isToday
        );
        return isToday;
      } catch (error) {
        console.error('Error checking schedule date:', error);
        return false;
      }
    }

    return false;
  }

  private async pollWorkerLocation() {
    if (!this.booking?.workerId || !this.locationTrackingActive) return;

    try {
      // Get the latest booking data which should include workerLocation
      const bookingRef = doc(this.firestore, 'bookings', this.bookingId);
      const bookingDoc = await getDocs(
        query(
          collection(this.firestore, 'bookings'),
          where('__name__', '==', this.bookingId),
          limit(1)
        )
      );

      if (!bookingDoc.empty) {
        const bookingData = bookingDoc.docs[0].data() as BookingData;
        if (bookingData.workerLocation) {
          this.workerLocation = bookingData.workerLocation;
          this.calculateDistanceAndArrival();
        }
      }
    } catch (error) {
      console.error('Error polling worker location:', error);
    }
  }

  private calculateDistanceAndArrival() {
    if (!this.workerLocation || !this.booking?.coordinates) {
      this.workerDistance = null;
      this.estimatedArrival = '';
      return;
    }

    // Calculate distance using Haversine formula
    const distance = this.calculateDistance(
      this.workerLocation.lat,
      this.workerLocation.lng,
      this.booking.coordinates.lat,
      this.booking.coordinates.lng
    );

    this.workerDistance = distance;

    // Estimate arrival time (assuming average speed of 30 km/h in city)
    if (distance > 0) {
      const estimatedMinutes = Math.round((distance / 30) * 60); // Convert to minutes
      if (estimatedMinutes < 5) {
        this.estimatedArrival = 'Arriving soon';
      } else if (estimatedMinutes < 60) {
        this.estimatedArrival = `~${estimatedMinutes} minutes`;
      } else {
        const hours = Math.floor(estimatedMinutes / 60);
        const minutes = estimatedMinutes % 60;
        this.estimatedArrival = `~${hours}h ${minutes}m`;
      }
    } else {
      this.estimatedArrival = 'Worker has arrived';
    }
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  getLocationTrackingStatus(): string {
    if (!this.locationTrackingActive) return '';

    if (!this.workerLocation) {
      return 'Waiting for worker location...';
    }

    if (this.workerDistance !== null) {
      if (this.workerDistance < 0.1) {
        // Less than 100m
        return 'Worker has arrived at your location!';
      } else {
        return `Worker is ${this.workerDistance.toFixed(1)}km away`;
      }
    }

    return 'Tracking worker location...';
  }

  getWorkerLocationIcon(): string {
    if (!this.locationTrackingActive || !this.workerLocation) {
      return 'location-outline';
    }

    if (this.workerDistance !== null && this.workerDistance < 0.1) {
      return 'checkmark-circle'; // Worker arrived
    }

    return 'navigate-circle'; // Worker en route
  }
}
