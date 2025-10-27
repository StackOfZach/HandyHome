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
  getDoc,
} from '@angular/fire/firestore';
import { AuthService } from '../../../services/auth.service';
import { DashboardService, ServiceCategory } from '../../../services/dashboard.service';
import { WorkerService } from '../../../services/worker.service';
import { Subscription, interval } from 'rxjs';

interface BookingData {
  id: string;
  clientId: string;
  workerId?: string;
  neededService: string;
  description: string;
  status:
    | 'pending'
    | 'accepted'
    | 'completed'
    | 'cancelled'
    | 'on-the-way'
    | 'worker-arrived'
    | 'service-started'
    | 'awaiting-payment';
  createdAt: any;
  updatedAt: any;
  scheduleDate: any;
  minBudget?: number;
  maxBudget?: number;
  priceRange?: number;
  urgency?: string;
  // Location fields
  coordinates?: { lat: number; lng: number };
  address?: string;
  city?: string;
  zipCode?: string;
  locationType?: 'saved' | 'current' | 'custom';
  // Saved location specific fields
  contactPerson?: string;
  phoneNumber?: string;
  savedLocationId?: string;
  // Payment and completion fields
  requestedAmount?: number;
  paymentStatus?: 'none' | 'requested' | 'paid' | string;
  completionPhoto?: string;
  serviceStartedAt?: any;
  completedAt?: any;
  // Worker location tracking
  workerLocation?: { lat: number; lng: number; timestamp: any };
  // Job timing and completion
  jobStartTime?: any;
  jobEndTime?: any;
  jobDuration?: number;
  calculatedPayment?: {
    baseAmount?: number;
    totalHours?: number;
    hourlyRate?: number;
    serviceFee?: number;
    transportationFee?: number;
    totalAmount?: number;
    actualDuration?: string;
    billingDuration?: string;
  };
  // Worker rating
  workerRating?: number;
  ratingComment?: string;
  ratedAt?: any;
  paidAt?: any;
}

interface WorkerLocationUpdate {
  workerId: string;
  bookingId: string;
  location: { lat: number; lng: number };
  timestamp: any;
}

interface SubServicePrice {
  subServiceName: string;
  price: number;
  unit?: string;
}

interface ServiceWithPricing {
  categoryName: string;
  subServices: SubServicePrice[];
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
  serviceWithPricing?: ServiceWithPricing[];
}

interface WorkerServicePricing {
  serviceName: string;
  subServiceName: string;
  price: number;
  unit: string;
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

  // Worker pricing
  workerPricing: WorkerServicePricing | null = null;
  serviceCategories: ServiceCategory[] = [];
  loadingPricing: boolean = false;

  // Rating and payment popup
  showRatingPopup: boolean = false;
  showPaymentModal: boolean = false;
  workerRating: number = 0;
  ratingComment: string = '';
  completionPhotoUrl: string = '';

  // Job timer
  jobTimer: string = '00:00:00';
  private jobTimerInterval?: any;
  private jobTimerSubscription?: Subscription;

  // Worker current location
  workerCurrentLocation: { lat: number; lng: number; timestamp?: any } | null = null;
  workerCurrentAddress: string = '';
  loadingWorkerLocation: boolean = false;
  workerLocationSubscription?: Subscription;

  statusMessages = {
    pending: 'Waiting for worker to accept your booking...',
    accepted: 'Worker accepted your booking! Job is scheduled.',
    'on-the-way': 'Worker is on the way to your location!',
    'worker-arrived': 'The worker has arrived at your location!',
    'service-started': 'Worker has started the service at your location.',
    'awaiting-payment': 'Service completed. Please review and provide payment.',
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
    private authService: AuthService,
    private dashboardService: DashboardService,
    private workerService: WorkerService
  ) {}

  async ngOnInit() {
    console.log('BookingProgressPage: ngOnInit started');
    this.currentUser = this.authService.getCurrentUser();
    console.log('Current user:', this.currentUser);

    // Make component accessible from console for debugging
    (window as any)['bookingPage'] = this;
    console.log('Component available at window.bookingPage for debugging');

    // Get booking ID from route params
    this.route.params.subscribe((params) => {
      this.bookingId = params['bookingId'];
      console.log('Booking ID from route:', this.bookingId);
      if (this.bookingId) {
        this.subscribeToBookingUpdates();
      }
    });
  }

  // ngOnDestroy method moved to end of class for comprehensive cleanup

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
          
          // Handle status changes for job timer and completion
          if (previousStatus !== this.booking.status) {
            this.handleStatusChange(this.booking.status, previousStatus);
          }

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
    console.log('handleLocationTrackingUpdate:', {
      previousStatus,
      currentStatus,
      bookingId: this.booking.id,
      workerId: this.booking.workerId
    });
    
    if (
      ['accepted', 'on-the-way', 'service-started'].includes(currentStatus) &&
      !this.locationTrackingActive
    ) {
      this.startLocationTracking();
    }
    
    // Start worker current location tracking when status is on-the-way
    console.log('Checking if should start worker location tracking:', {
      currentStatus,
      previousStatus,
      shouldStart: currentStatus === 'on-the-way' && previousStatus !== 'on-the-way'
    });
    
    if (currentStatus === 'on-the-way' && previousStatus !== 'on-the-way') {
      console.log('Starting worker location tracking due to status change');
      this.startWorkerLocationTracking();
    }
    
    // Also start if current status is already on-the-way (for page refresh scenarios)
    if (currentStatus === 'on-the-way' && !this.workerLocationSubscription) {
      console.log('Starting worker location tracking - status is already on-the-way');
      this.startWorkerLocationTracking();
    }
    
    // Stop location tracking when job is completed or cancelled
    else if (
      ['completed', 'cancelled', 'awaiting-payment'].includes(currentStatus)
    ) {
      if (this.locationTrackingActive) {
        this.stopLocationTracking();
      }
      // Also stop worker location tracking
      this.stopWorkerLocationTracking();
    }
  }

  async loadWorkerProfile() {
    if (!this.booking?.workerId) {
      console.log('No worker ID found in booking');
      return;
    }

    console.log('Loading worker profile for ID:', this.booking.workerId);

    try {
      // Load service categories first
      console.log('Loading service categories...');
      await this.loadServiceCategories();
      
      // Fetch actual worker profile from Firestore
      console.log('Fetching worker profile from Firestore...');
      const workerProfile = await this.workerService.getCompleteWorkerProfile(this.booking.workerId);
      console.log('Worker profile fetched:', workerProfile);
      console.log('Worker serviceWithPricing:', (workerProfile as any)?.serviceWithPricing);
      console.log('Booking neededService:', this.booking.neededService);
      console.log('Booking specificService:', (this.booking as any).specificService);
      
      if (workerProfile) {
        this.worker = {
          uid: workerProfile.uid,
          fullName: workerProfile.fullName || 'HandyHome Worker',
          photoUrl: workerProfile.profilePhotoUrl || '/assets/default-avatar.png',
          rating: workerProfile.rating || 0, // Use 0 for new workers with no ratings
          reviewCount: workerProfile.jobsCompleted || 0, // Use actual job count instead of mock
          skills: workerProfile.skills || ['General Repair', 'Maintenance'],
          phoneNumber: workerProfile.phone || '',
          verificationStatus: workerProfile.status || 'verified',
          serviceWithPricing: (workerProfile as any).serviceWithPricing || []
        };
        
        // Debug worker rating information
        console.log('Worker rating info:', {
          rating: this.worker.rating,
          reviewCount: this.worker.reviewCount,
          isNewWorker: this.isNewWorker()
        });
        
        // Load worker pricing for this specific service
        await this.loadWorkerPricing();
        
        // Test: Try to start worker location tracking if status is on-the-way
        if (this.booking?.status === 'on-the-way') {
          console.log('Booking status is on-the-way, starting location tracking...');
          setTimeout(() => {
            this.startWorkerLocationTracking();
          }, 1000); // Delay to ensure everything is loaded
        }
      } else {
        console.log('Worker profile not found, using fallback data');
        // Fallback to basic data if worker profile not found
        this.worker = {
          uid: this.booking.workerId,
          fullName: 'HandyHome Worker',
          photoUrl: '/assets/default-avatar.png',
          rating: 0, // New worker with no ratings
          reviewCount: 0,
          skills: ['General Repair', 'Maintenance'],
          phoneNumber: '',
          verificationStatus: 'verified',
        };
      }
    } catch (error) {
      console.error('Error loading worker profile:', error);
      // Fallback to mock data on error
      this.worker = {
        uid: this.booking.workerId,
        fullName: 'HandyHome Worker',
        photoUrl: '/assets/default-avatar.png',
        rating: 0, // New worker with no ratings
        reviewCount: 0,
        skills: ['General Repair', 'Maintenance'],
        phoneNumber: '',
        verificationStatus: 'verified',
      };
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
    if (!this.booking || !this.canCancelBooking()) return;

    // Create different messages based on booking status
    let message = 'Are you sure you want to cancel this booking? This action cannot be undone.';
    let warningMessage = '';
    
    if (this.booking.status === 'accepted') {
      warningMessage = 'The worker has already accepted this booking. ';
    } else if (this.booking.status === 'on-the-way') {
      warningMessage = 'The worker is currently on the way to your location. ';
    } else if (this.booking.status === 'service-started') {
      warningMessage = 'The service has already started. ';
    }
    
    if (warningMessage) {
      message = warningMessage + 'Cancelling now may result in cancellation fees. Are you sure you want to proceed?';
    }

    const alert = await this.alertController.create({
      header: 'Cancel Booking',
      message: message,
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

  // ===== PRICING METHODS =====

  async loadServiceCategories() {
    try {
      this.serviceCategories = await this.dashboardService.getServiceCategories();
      console.log('Service categories loaded:', this.serviceCategories);
    } catch (error) {
      console.error('Error loading service categories:', error);
      this.serviceCategories = [];
    }
  }

  async loadWorkerPricing() {
    if (!this.worker || !this.booking) return;

    try {
      this.loadingPricing = true;
      
      // Get the main service and specific service from booking
      const mainService = this.booking.neededService;
      const specificService = (this.booking as any).specificService;
      
      console.log('Looking for pricing for:', { mainService, specificService });
      console.log('Worker serviceWithPricing:', this.worker.serviceWithPricing);
      
      // Look for pricing in worker's serviceWithPricing array
      if (this.worker.serviceWithPricing && this.worker.serviceWithPricing.length > 0) {
        let foundPricing: SubServicePrice | null = null;
        let matchedCategory: ServiceWithPricing | null = null;
        
        console.log('Available categories:', this.worker.serviceWithPricing.map(c => c.categoryName));
        
        // First, try to find the matching category (main service) - more flexible matching
        matchedCategory = this.worker.serviceWithPricing.find((category: ServiceWithPricing) => {
          const categoryLower = category.categoryName.toLowerCase();
          const serviceLower = mainService.toLowerCase();
          
          console.log(`Comparing category "${categoryLower}" with service "${serviceLower}"`);
          
          return categoryLower === serviceLower ||
                 categoryLower.includes(serviceLower) ||
                 serviceLower.includes(categoryLower) ||
                 this.isServiceMatch(categoryLower, serviceLower);
        }) || null;
        
        if (matchedCategory) {
          console.log('Found matching category:', matchedCategory);
          console.log('Available sub-services:', matchedCategory.subServices.map(s => s.subServiceName));
          
          // If we have a specific service, look for exact match in subServices
          if (specificService) {
            console.log('Looking for specific service:', specificService);
            foundPricing = matchedCategory.subServices.find((subService: SubServicePrice) => {
              const subServiceLower = subService.subServiceName.toLowerCase();
              const specificLower = specificService.toLowerCase();
              
              console.log(`Comparing sub-service "${subServiceLower}" with specific "${specificLower}"`);
              
              return subServiceLower === specificLower ||
                     subServiceLower.includes(specificLower) ||
                     specificLower.includes(subServiceLower) ||
                     this.isServiceMatch(subServiceLower, specificLower);
            }) || null;
            
            if (foundPricing) {
              console.log('Found exact sub-service match:', foundPricing);
            }
          }
          
          // If no specific service found, use the first subservice
          if (!foundPricing && matchedCategory.subServices.length > 0) {
            foundPricing = matchedCategory.subServices[0];
            console.log('Using first available sub-service:', foundPricing);
          }
        } else {
          console.log('No matching category found for:', mainService);
        }
        
        // If no category match, search all subservices across all categories
        if (!foundPricing && specificService) {
          for (const category of this.worker.serviceWithPricing) {
            const subServiceMatch = category.subServices.find(subService => 
              subService.subServiceName.toLowerCase().includes(specificService.toLowerCase()) ||
              specificService.toLowerCase().includes(subService.subServiceName.toLowerCase())
            );
            if (subServiceMatch) {
              foundPricing = subServiceMatch;
              matchedCategory = category;
              break;
            }
          }
        }
        
        if (foundPricing && matchedCategory) {
          // Get the unit from the subservice or from service categories
          let unit = foundPricing.unit || await this.getServiceUnit(matchedCategory.categoryName, foundPricing.subServiceName);
          
          // Format the unit properly
          unit = this.formatUnit(unit || 'per_hour');
          
          this.workerPricing = {
            serviceName: matchedCategory.categoryName,
            subServiceName: foundPricing.subServiceName,
            price: foundPricing.price,
            unit: unit
          };
          
          console.log('Found exact pricing:', this.workerPricing);
        }
      }
      
      // If no pricing found, try to fetch directly from workers collection
      if (!this.workerPricing) {
        console.log('No worker pricing found in profile, trying direct fetch from workers collection...');
        await this.fetchWorkerPricingDirectly(mainService, specificService);
      }
      
      // If still no pricing found, create mock pricing for testing
      if (!this.workerPricing) {
        console.log('No worker pricing found anywhere, creating mock data for testing');
        const unit = await this.getServiceUnit(mainService, specificService || mainService);
        
        this.workerPricing = {
          serviceName: mainService,
          subServiceName: specificService || mainService,
          price: 500, // Mock price
          unit: this.formatUnit(unit)
        };
      }
      
      console.log('Worker pricing loaded:', this.workerPricing);
    } catch (error) {
      console.error('Error loading worker pricing:', error);
    } finally {
      this.loadingPricing = false;
    }
  }

  async getServiceUnit(serviceName: string, subServiceName: string): Promise<string> {
    try {
      // Find the service category that matches the service name
      const serviceCategory = this.serviceCategories.find(cat => 
        cat.name.toLowerCase() === serviceName.toLowerCase() ||
        cat.services.some(service => service.toLowerCase() === serviceName.toLowerCase())
      );
      
      if (serviceCategory && serviceCategory.services && serviceCategory.servicesQuickBookingUnit) {
        // Find the index of the subservice in the services array
        const subServiceIndex = serviceCategory.services.findIndex(service => 
          service.toLowerCase() === subServiceName.toLowerCase()
        );
        
        if (subServiceIndex >= 0 && serviceCategory.servicesQuickBookingUnit[subServiceIndex]) {
          return serviceCategory.servicesQuickBookingUnit[subServiceIndex];
        }
      }
      
      // Default fallback
      return 'per hour';
    } catch (error) {
      console.error('Error getting service unit:', error);
      return 'per hour';
    }
  }

  async fetchWorkerPricingDirectly(mainService: string, specificService?: string): Promise<void> {
    try {
      console.log('Fetching worker pricing directly from workers collection...');
      
      // Get worker document directly from Firestore
      const workerDoc = await getDocs(
        query(
          collection(this.firestore, 'workers'),
          where('__name__', '==', this.booking!.workerId),
          limit(1)
        )
      );
      
      if (!workerDoc.empty) {
        const workerData = workerDoc.docs[0].data();
        console.log('Direct worker data:', workerData);
        console.log('Direct serviceWithPricing:', workerData['serviceWithPricing']);
        
        const serviceWithPricing = workerData['serviceWithPricing'] as ServiceWithPricing[];
        
        if (serviceWithPricing && serviceWithPricing.length > 0) {
          // Update worker object with the fetched data
          this.worker!.serviceWithPricing = serviceWithPricing;
          
          // Try to find pricing again with the new data
          await this.findPricingInData(serviceWithPricing, mainService, specificService);
        }
      }
    } catch (error) {
      console.error('Error fetching worker pricing directly:', error);
    }
  }

  async findPricingInData(serviceWithPricing: ServiceWithPricing[], mainService: string, specificService?: string): Promise<void> {
    let foundPricing: SubServicePrice | null = null;
    let matchedCategory: ServiceWithPricing | null = null;
    
    console.log('Searching in direct data - Available categories:', serviceWithPricing.map(c => c.categoryName));
    
    // Find matching category
    matchedCategory = serviceWithPricing.find((category: ServiceWithPricing) => {
      const categoryLower = category.categoryName.toLowerCase();
      const serviceLower = mainService.toLowerCase();
      
      console.log(`Direct search - Comparing category "${categoryLower}" with service "${serviceLower}"`);
      
      return categoryLower === serviceLower ||
             categoryLower.includes(serviceLower) ||
             serviceLower.includes(categoryLower) ||
             this.isServiceMatch(categoryLower, serviceLower);
    }) || null;
    
    if (matchedCategory) {
      console.log('Direct search - Found matching category:', matchedCategory);
      
      // Look for specific service
      if (specificService) {
        foundPricing = matchedCategory.subServices.find((subService: SubServicePrice) => {
          const subServiceLower = subService.subServiceName.toLowerCase();
          const specificLower = specificService.toLowerCase();
          
          return subServiceLower === specificLower ||
                 subServiceLower.includes(specificLower) ||
                 specificLower.includes(subServiceLower);
        }) || null;
      }
      
      // Use first subservice if no specific match
      if (!foundPricing && matchedCategory.subServices.length > 0) {
        foundPricing = matchedCategory.subServices[0];
      }
      
      if (foundPricing) {
        const unit = foundPricing.unit || await this.getServiceUnit(matchedCategory.categoryName, foundPricing.subServiceName);
        
        this.workerPricing = {
          serviceName: matchedCategory.categoryName,
          subServiceName: foundPricing.subServiceName,
          price: foundPricing.price,
          unit: this.formatUnit(unit || 'per_hour')
        };
        
        console.log('Direct search - Found pricing:', this.workerPricing);
      }
    }
  }

  isServiceMatch(service1: string, service2: string): boolean {
    // Helper method for more flexible service matching
    const commonWords = ['service', 'services', 'work', 'repair', 'maintenance'];
    
    // Remove common words and compare
    const clean1 = service1.replace(new RegExp(commonWords.join('|'), 'gi'), '').trim();
    const clean2 = service2.replace(new RegExp(commonWords.join('|'), 'gi'), '').trim();
    
    return clean1.includes(clean2) || clean2.includes(clean1);
  }

  formatUnit(unit: string): string {
    // Convert database units to display format
    switch (unit?.toLowerCase()) {
      case 'per_hour':
        return '/hr';
      case 'per_day':
        return '/day';
      case 'per hour':
        return '/hr';
      case 'per day':
        return '/day';
      default:
        return unit || '/hr';
    }
  }

  getWorkerPriceDisplay(): string {
    if (!this.workerPricing) {
      return 'Price not available';
    }
    
    return `₱${this.workerPricing.price.toLocaleString()} ${this.workerPricing.unit}`;
  }

  hasWorkerPricing(): boolean {
    return this.workerPricing !== null;
  }

  isNewWorker(): boolean {
    if (!this.worker) return false;
    
    // Consider a worker "new" if they have no rating or very few completed jobs
    return this.worker.rating === 0 || this.worker.rating === null || 
           this.worker.reviewCount === 0 || this.worker.reviewCount === null;
  }

  // ===== WORKER CURRENT LOCATION METHODS =====

  async startWorkerLocationTracking() {
    console.log('startWorkerLocationTracking called with:', {
      hasBooking: !!this.booking,
      workerId: this.booking?.workerId,
      status: this.booking?.status,
      shouldProceed: !!(this.booking?.workerId && this.booking.status === 'on-the-way')
    });
    
    if (!this.booking?.workerId) {
      console.log('No workerId found, cannot start location tracking');
      return;
    }
    
    if (this.booking.status !== 'on-the-way') {
      console.log('Status is not on-the-way, current status:', this.booking.status);
      return;
    }

    console.log('Starting worker current location tracking for worker:', this.booking.workerId);
    this.loadingWorkerLocation = true;

    try {
      // Set up real-time listener for worker location from workers collection
      const workerRef = doc(this.firestore, 'workers', this.booking.workerId);
      
      this.workerLocationSubscription = new Subscription();
      this.workerLocationSubscription.add(
        onSnapshot(
          workerRef,
          async (doc) => {
            if (doc.exists()) {
              const workerData = doc.data();
              console.log('Worker data:', workerData);
              console.log('Worker currentLocation:', workerData['currentLocation']);
              
              const currentLocation = workerData['currentLocation'];
              
              if (currentLocation) {
                let lat: number, lng: number;
                
                // Handle Firestore GeoPoint
                if (currentLocation._lat !== undefined && currentLocation._long !== undefined) {
                  lat = currentLocation._lat;
                  lng = currentLocation._long;
                  console.log('Found GeoPoint location:', { lat, lng });
                }
                // Handle regular lat/lng object
                else if (currentLocation.lat !== undefined && currentLocation.lng !== undefined) {
                  lat = currentLocation.lat;
                  lng = currentLocation.lng;
                  console.log('Found regular lat/lng location:', { lat, lng });
                }
                // Handle latitude/longitude naming
                else if (currentLocation.latitude !== undefined && currentLocation.longitude !== undefined) {
                  lat = currentLocation.latitude;
                  lng = currentLocation.longitude;
                  console.log('Found latitude/longitude location:', { lat, lng });
                } else {
                  console.log('No valid coordinates found in currentLocation:', currentLocation);
                  this.workerCurrentLocation = null;
                  this.workerCurrentAddress = '';
                  return;
                }
                
                this.workerCurrentLocation = {
                  lat: lat,
                  lng: lng,
                  timestamp: currentLocation.timestamp || new Date()
                };
                
                console.log('Found worker location:', this.workerCurrentLocation);
                
                // Convert coordinates to address
                await this.getAddressFromCoordinates(
                  this.workerCurrentLocation.lat,
                  this.workerCurrentLocation.lng
                );
              } else {
                console.log('No currentLocation field found in worker data');
                this.workerCurrentLocation = null;
                this.workerCurrentAddress = '';
              }
            } else {
              console.log('Worker document not found');
              this.workerCurrentLocation = null;
              this.workerCurrentAddress = '';
            }
            this.loadingWorkerLocation = false;
          },
          (error) => {
            console.error('Error listening to worker location:', error);
            this.loadingWorkerLocation = false;
          }
        )
      );
    } catch (error) {
      console.error('Error setting up worker location tracking:', error);
      this.loadingWorkerLocation = false;
    }
  }

  stopWorkerLocationTracking() {
    console.log('Stopping worker current location tracking');
    if (this.workerLocationSubscription) {
      this.workerLocationSubscription.unsubscribe();
      this.workerLocationSubscription = undefined;
    }
    this.workerCurrentLocation = null;
    this.workerCurrentAddress = '';
    this.loadingWorkerLocation = false;
  }

  async getAddressFromCoordinates(lat: number, lng: number): Promise<void> {
    try {
      console.log(`Converting coordinates to address: ${lat}, ${lng}`);
      
      // Using Nominatim (OpenStreetMap) - Free service
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'HandyHome-App/1.0'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.display_name) {
          // Clean up the address to make it more readable
          let address = data.display_name;
          
          // Try to get a shorter, more relevant address
          if (data.address) {
            const addr = data.address;
            const parts = [];
            
            if (addr.house_number && addr.road) {
              parts.push(`${addr.house_number} ${addr.road}`);
            } else if (addr.road) {
              parts.push(addr.road);
            }
            
            if (addr.suburb || addr.neighbourhood) {
              parts.push(addr.suburb || addr.neighbourhood);
            }
            
            if (addr.city || addr.town || addr.village) {
              parts.push(addr.city || addr.town || addr.village);
            }
            
            if (parts.length > 0) {
              address = parts.join(', ');
            }
          }
          
          this.workerCurrentAddress = address;
          console.log('Worker current address:', this.workerCurrentAddress);
        } else {
          this.workerCurrentAddress = `Near ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
      } else {
        // Fallback to coordinates if geocoding fails
        this.workerCurrentAddress = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    } catch (error) {
      console.error('Error converting coordinates to address:', error);
      // Fallback to showing coordinates
      this.workerCurrentAddress = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }

  // Alternative method using browser's built-in reverse geocoding (if available)
  async getAddressFromCoordinatesAlternative(lat: number, lng: number): Promise<void> {
    try {
      // For now, we'll use a simple fallback that shows a readable location
      // You can integrate with services like OpenStreetMap Nominatim (free) or Google Maps
      
      // Using Nominatim (OpenStreetMap) - Free alternative
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.display_name) {
          this.workerCurrentAddress = data.display_name;
          console.log('Worker current address (Nominatim):', this.workerCurrentAddress);
        } else {
          this.workerCurrentAddress = `Near ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
      } else {
        this.workerCurrentAddress = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    } catch (error) {
      console.error('Error with alternative geocoding:', error);
      this.workerCurrentAddress = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }

  // ===== BOOKING CANCELLATION METHODS =====

  canCancelBooking(): boolean {
    if (!this.booking) return false;
    
    // Don't allow cancellation if already completed or cancelled
    if (['completed', 'cancelled'].includes(this.booking.status)) {
      return false;
    }
    
    // Check if booking date is today or in the past
    if (this.booking.scheduleDate) {
      try {
        let scheduleDate: Date;
        if (this.booking.scheduleDate?.toDate && typeof this.booking.scheduleDate.toDate === 'function') {
          scheduleDate = this.booking.scheduleDate.toDate();
        } else if (this.booking.scheduleDate instanceof Date) {
          scheduleDate = this.booking.scheduleDate;
        } else {
          scheduleDate = new Date(this.booking.scheduleDate);
        }
        
        if (isNaN(scheduleDate.getTime())) {
          console.warn('Invalid schedule date, allowing cancellation');
          return true;
        }
        
        const today = new Date();
        const bookingDate = new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), scheduleDate.getDate());
        const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        console.log('Checking cancellation eligibility:');
        console.log('Booking date:', bookingDate.toDateString());
        console.log('Current date:', currentDate.toDateString());
        console.log('Booking status:', this.booking.status);
        
        // Allow cancellation if booking date is in the future
        return bookingDate > currentDate;
      } catch (error) {
        console.error('Error checking booking date for cancellation:', error);
        return true; // Allow cancellation if date check fails
      }
    }
    
    // If no schedule date, allow cancellation for non-completed bookings
    return true;
  }

  getCancellationMessage(): string {
    if (!this.booking) return '';
    
    if (['completed', 'cancelled'].includes(this.booking.status)) {
      return '';
    }
    
    if (this.booking.status === 'pending') {
      return 'Cancel Booking';
    } else if (this.booking.status === 'accepted') {
      return 'Cancel Booking';
    } else if (['on-the-way', 'service-started'].includes(this.booking.status)) {
      return 'Cancel Booking';
    }
    
    return 'Cancel Booking';
  }

  // ===== DEBUG/TEST METHODS =====

  // Test method - call this from browser console: window['bookingPage'].testWorkerLocation()
  async testWorkerLocation() {
    console.log('=== MANUAL WORKER LOCATION TEST ===');
    console.log('Current booking:', this.booking);
    console.log('Current status:', this.booking?.status);
    console.log('Worker ID:', this.booking?.workerId);
    
    if (!this.booking?.workerId) {
      console.log('ERROR: No worker ID found');
      return;
    }
    
    try {
      // Fetch worker document directly
      const workerRef = doc(this.firestore, 'workers', this.booking.workerId);
      const workerDoc = await getDoc(workerRef);
      
      if (workerDoc.exists()) {
        const workerData = workerDoc.data();
        console.log('Worker document found:', workerData);
        console.log('currentLocation field:', workerData['currentLocation']);
        
        if (workerData['currentLocation']) {
          const loc = workerData['currentLocation'];
          console.log('Location data:', loc);
          console.log('Location type:', typeof loc);
          console.log('Location constructor:', loc.constructor.name);
          
          let lat: number, lng: number;
          
          // Handle Firestore GeoPoint
          if (loc._lat !== undefined && loc._long !== undefined) {
            lat = loc._lat;
            lng = loc._long;
            console.log('Valid GeoPoint coordinates found:', lat, lng);
          }
          // Handle regular lat/lng object
          else if (loc.lat !== undefined && loc.lng !== undefined) {
            lat = loc.lat;
            lng = loc.lng;
            console.log('Valid lat/lng coordinates found:', lat, lng);
          }
          // Handle latitude/longitude naming
          else if (loc.latitude !== undefined && loc.longitude !== undefined) {
            lat = loc.latitude;
            lng = loc.longitude;
            console.log('Valid latitude/longitude coordinates found:', lat, lng);
          } else {
            console.log('ERROR: No valid coordinates found in currentLocation');
            console.log('Available properties:', Object.keys(loc));
            return;
          }
          
          // Test address conversion
          this.workerCurrentLocation = { lat, lng, timestamp: new Date() };
          await this.getAddressFromCoordinates(lat, lng);
          console.log('Address result:', this.workerCurrentAddress);
        } else {
          console.log('ERROR: No currentLocation field in worker document');
        }
      } else {
        console.log('ERROR: Worker document not found');
      }
    } catch (error) {
      console.error('ERROR in test:', error);
    }
  }

  // Force start location tracking - call from console: window['bookingPage'].forceStartLocationTracking()
  forceStartLocationTracking() {
    console.log('=== FORCE START LOCATION TRACKING ===');
    this.startWorkerLocationTracking();
  }

  // ===== JOB TIMER AND COMPLETION METHODS =====

  startJobTimer() {
    if (!this.booking?.jobStartTime) return;

    if (this.jobTimerSubscription) {
      this.jobTimerSubscription.unsubscribe();
    }

    this.jobTimerSubscription = interval(1000).subscribe(() => {
      if (this.booking?.jobStartTime) {
        const startTime = this.booking.jobStartTime.toDate();
        const now = new Date();
        const diff = now.getTime() - startTime.getTime();
        this.jobTimer = this.formatDuration(diff);
      }
    });
  }

  stopJobTimer() {
    if (this.jobTimerSubscription) {
      this.jobTimerSubscription.unsubscribe();
      this.jobTimerSubscription = undefined;
    }
  }

  formatDuration(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Show rating popup when job is completed
  async showWorkerRatingPopup() {
    this.showRatingPopup = true;
    this.completionPhotoUrl = this.booking?.completionPhoto || '';
  }

  // Submit worker rating
  async submitWorkerRating() {
    if (this.workerRating === 0) {
      const toast = await this.toastController.create({
        message: 'Please select a rating',
        duration: 2000,
        color: 'warning'
      });
      await toast.present();
      return;
    }

    try {
      // Update booking with rating
      const bookingRef = doc(this.firestore, 'bookings', this.bookingId);
      await updateDoc(bookingRef, {
        workerRating: this.workerRating,
        ratingComment: this.ratingComment,
        ratedAt: new Date(),
        updatedAt: new Date()
      });

      // Update worker's overall rating (you might want to implement this in a cloud function)
      // For now, we'll just close the popup and show payment
      
      this.showRatingPopup = false;
      await this.showPaymentPopup();
      
    } catch (error) {
      console.error('Error submitting rating:', error);
      const toast = await this.toastController.create({
        message: 'Error submitting rating',
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
    }
  }

  // Show payment popup with breakdown
  async showPaymentPopup() {
    if (!this.booking?.calculatedPayment) return;
    this.showPaymentModal = true;
  }


  // Note: Payment is now confirmed by the worker, not the client
  // The payment modal will close automatically when booking status changes to 'completed'

  // Handle status changes to trigger appropriate actions
  handleStatusChange(newStatus: string, previousStatus?: string) {
    console.log('Status changed:', { previousStatus, newStatus });
    
    switch (newStatus) {
      case 'service-started':
        this.startJobTimer();
        break;
        
      case 'awaiting-payment':
        this.stopJobTimer();
        // Show rating popup after a short delay
        setTimeout(() => {
          this.showWorkerRatingPopup();
        }, 1000);
        break;
        
      case 'completed':
        this.stopJobTimer();
        // Close payment modal if open
        if (this.showPaymentModal) {
          this.showPaymentModal = false;
          
          // Show success message
          setTimeout(async () => {
            const toast = await this.toastController.create({
              message: 'Payment confirmed by worker! Thank you for using HandyHome.',
              duration: 4000,
              color: 'success'
            });
            await toast.present();
          }, 500);
        }
        break;
    }
  }

  // ===== RATING AND PAYMENT METHODS =====

  ngOnDestroy() {
    if (this.bookingSubscription) {
      this.bookingSubscription();
    }
    // Clean up worker location tracking
    this.stopWorkerLocationTracking();
    // Clean up job timer
    this.stopJobTimer();
  }
}
