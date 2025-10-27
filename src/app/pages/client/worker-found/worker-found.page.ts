import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Firestore,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  Unsubscribe,
} from '@angular/fire/firestore';
import {
  ToastController,
  AlertController,
  ActionSheetController,
  ModalController,
} from '@ionic/angular';
import { ReportWorkerModalComponent } from '../../../components/report-worker-modal/report-worker-modal.component';
import { PaymentModalComponent } from '../../../components/payment-modal/payment-modal.component';
import { PaymentService } from '../../../services/payment.service';
import { ReportService } from '../../../services/report.service';
import {
  WorkerTrackingService,
  TrackingData,
} from '../../../services/worker-tracking.service';
import { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface BookingData {
  id: string;
  clientId: string;
  categoryId: string;
  categoryName: string;
  subService: string;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  pricing: {
    basePrice: number;
    serviceCharge: number;
    transportFee: number;
    total: number;
  };
  estimatedDuration: string;
  status: string;
  assignedWorker: string;
  createdAt: any;
  acceptedAt: any;
  startedAt?: any;
  completedAt?: any;
  // Job completion data
  completionPhoto?: string;
  jobTimer?: {
    startTime: any;
    endTime?: any;
    duration?: number;
  };
  finalPricing?: {
    basePrice: number;
    serviceCharge: number;
    transportFee: number;
    total: number;
    pricingType: string;
    duration: number;
    originalBasePrice: number;
  };
  // Payment information
  paymentDetails?: {
    status: 'pending' | 'completed' | 'failed';
    receiptId?: string;
    amount?: number;
    completedAt?: Date;
  };
}

interface WorkerData {
  uid: string;
  fullName: string;
  profilePhotoUrl?: string;
  profilePhotoData?: string; // Base64 image data from workers collection
  rating: number;
  skills: string[];
  location: {
    lat: number;
    lng: number;
  };
  phone?: string;
  email?: string;
  verificationStatus: string;
  totalJobs: number;
}

interface UserData {
  uid: string;
  fullName: string;
  email: string;
  phone?: string;
  profilePicture?: string;
}

interface MapCoordinates {
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
}

interface MapPin {
  position?: MapCoordinates;
  coordinates?: MapCoordinates;
  label?: string;
  title?: string;
  color?: string;
}

interface DetailedAddress {
  formattedAddress: string;
  street?: string;
  barangay?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  nearbyLandmark?: string;
  placeId?: string;
}

@Component({
  selector: 'app-worker-found',
  templateUrl: './worker-found.page.html',
  styleUrls: ['./worker-found.page.scss'],
  standalone: false,
})
export class WorkerFoundPage implements OnInit, OnDestroy {
  bookingId: string = '';
  bookingData: BookingData | null = null;
  workerData: WorkerData | null = null;
  isQuickBooking: boolean = false;

  isLoading: boolean = true;
  distance: number = 0;
  estimatedArrival: string = '';

  // Real-time tracking data
  trackingData: TrackingData | null = null;
  showMap: boolean = false;
  mapCoordinates: MapCoordinates = { lat: 0, lng: 0 };
  mapPins: MapPin[] = [];
  tracePath: MapCoordinates[] = [];

  private bookingListener?: Unsubscribe;
  private trackingSubscription?: Subscription;
  private refreshTimer?: number;

  // Status messages
  bookingStatusMessage: string = 'Tracking your booking...';
  workerDistanceMessage: string = 'Locating worker...';
  workerLocationText: string = 'Locating worker...';
  
  // Payment completion flag
  isPaymentConfirmed: boolean = false;

  // Job timer for client display
  jobTimer: any = null;
  elapsedTime: string = '00:00:00';

  // Completion and rating modals
  showCompletionModal: boolean = false;
  showRatingModal: boolean = false;
  showPriceBreakdownModal: boolean = false;
  showPaymentModal: boolean = false;
  completionPhoto: string = '';
  clientRating: number = 0;
  clientReview: string = '';
  finalPricing: any = null;
  hasRatedWorker: boolean = false;
  workerDetailedAddress: DetailedAddress | null = null;
  isLoadingAddress: boolean = false;

  // Client/Service location address
  clientLocationAddress: string = 'Loading location...';
  isLoadingClientAddress: boolean = false;

  private firestore = inject(Firestore);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastController: ToastController,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private modalController: ModalController,
    private paymentService: PaymentService,
    private reportService: ReportService,
    private workerTrackingService: WorkerTrackingService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    console.log('=== WORKER-FOUND PAGE INITIALIZED ===');
    
    // Get booking ID from route parameters or query parameters
    this.bookingId = this.route.snapshot.paramMap.get('bookingId') || 
                     this.route.snapshot.queryParamMap.get('bookingId') || '';
    
    // Check if this is a quick booking or coming from history
    this.isQuickBooking = this.route.snapshot.queryParamMap.get('type') === 'quick' ||
                          this.route.snapshot.queryParamMap.get('fromHistory') === 'true';
    
    console.log('Worker-found page - Booking ID:', this.bookingId);
    console.log('Worker-found page - Is Quick Booking:', this.isQuickBooking);
    console.log('Worker-found page - Route params:', this.route.snapshot.paramMap);
    console.log('Worker-found page - Query params:', this.route.snapshot.queryParamMap);
    
    if (this.bookingId) {
      console.log('Worker-found page - Starting initialization...');
      this.initializeBookingTracking();
    } else {
      console.error('Worker-found page - No booking ID found, redirecting to dashboard');
      this.router.navigate(['/client/dashboard']);
    }
  }

  ngOnDestroy() {
    if (this.bookingListener) {
      this.bookingListener();
    }

    if (this.trackingSubscription) {
      this.trackingSubscription.unsubscribe();
    }

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.workerTrackingService.stopTracking();
  }

  async initializeBookingTracking() {
    try {
      await this.determineBookingType();
      await this.loadBookingData();
      
      // Set up real-time listener AFTER loading data and determining collection type
      console.log('Setting up booking listener with collection type:', this.isQuickBooking ? 'quickbookings' : 'bookings');
      this.setupBookingListener();
      
      this.startLocationTracking();
      this.startPeriodicTimerCheck();
    } catch (error) {
      console.error('Error initializing booking tracking:', error);
      this.showToast('Failed to load booking details', 'danger');
      this.router.navigate(['/client/dashboard']);
    }
  }

  private async determineBookingType(): Promise<void> {
    try {
      // Check quickbookings collection first
      const quickBookingRef = doc(
        this.firestore,
        `quickbookings/${this.bookingId}`
      );
      const quickBookingSnap = await getDoc(quickBookingRef);

      if (quickBookingSnap.exists()) {
        this.isQuickBooking = true;
        return;
      }

      // Check regular bookings collection
      const regularBookingRef = doc(
        this.firestore,
        `bookings/${this.bookingId}`
      );
      const regularBookingSnap = await getDoc(regularBookingRef);

      if (regularBookingSnap.exists()) {
        this.isQuickBooking = false;
        return;
      }

      // If neither exists, redirect to dashboard
      this.router.navigate(['/client/dashboard']);
      this.showToast('Booking not found', 'danger');
    } catch (error) {
      console.error('Error determining booking type:', error);
      this.router.navigate(['/client/dashboard']);
      this.showToast('Error loading booking', 'danger');
    }
  }

  async loadBookingAndWorkerData() {
    try {
      // First, determine if this is a quick booking or regular booking
      await this.determineBookingType();

      // Load booking data from the correct collection
      const collection = this.isQuickBooking ? 'quickbookings' : 'bookings';
      const bookingRef = doc(this.firestore, `${collection}/${this.bookingId}`);
      const bookingSnap = await getDoc(bookingRef);

      if (bookingSnap.exists()) {
        this.bookingData = {
          id: bookingSnap.id,
          ...bookingSnap.data(),
        } as BookingData;

        if (this.bookingData.assignedWorker) {
          // Load worker data
          await this.loadWorkerData(this.bookingData.assignedWorker);

          // Calculate distance and ETA
          this.calculateDistanceAndETA();

          // Set up real-time listener for booking status
          this.setupBookingListener();

          // Initialize worker tracking
          this.initializeWorkerTracking();
        } else {
          // Check if booking is still pending (no worker assigned yet)
          if (this.bookingData.status === 'pending') {
            // No worker assigned yet, redirect back to searching
            this.router.navigate(['/client/searching', this.bookingId]);
          } else if (this.bookingData.status === 'accepted') {
            // Worker accepted but assignedWorker field might not be synced yet
            // Set up listener and wait for the assignedWorker field to be populated
            console.log('Booking accepted but assignedWorker not yet synced, waiting...');
            this.setupBookingListener();
            
            // Show loading state while waiting for worker data
            this.isLoading = true;
          } else {
            // Other statuses without assigned worker, redirect to searching
            this.router.navigate(['/client/searching', this.bookingId]);
          }
        }
      } else {
        this.showToast('Booking not found', 'danger');
        this.router.navigate(['/client/dashboard']);
      }
    } catch (error) {
      console.error('Error loading booking data:', error);
      this.showToast('Error loading booking details', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  private async loadWorkerData(workerId: string) {
    try {
      console.log('Loading worker data for ID:', workerId);

      // Load data from both collections in parallel
      const [workerSnap, userSnap] = await Promise.all([
        getDoc(doc(this.firestore, `workers/${workerId}`)),
        getDoc(doc(this.firestore, `users/${workerId}`)),
      ]);

      if (workerSnap.exists()) {
        const workerData = workerSnap.data();
        console.log('Worker data loaded:', workerData);

        // Initialize worker data with workers collection data
        this.workerData = {
          uid: workerSnap.id,
          fullName: workerData['fullName'] || 'Unknown Worker',
          rating: workerData['rating'] || 0,
          skills: workerData['skills'] || [],
          location: this.extractWorkerLocation(workerData),
          verificationStatus: workerData['verificationStatus'] || 'pending',
          totalJobs: workerData['totalJobs'] || 0,
          profilePhotoData: workerData['profilePhotoData'] || null, // Base64 image from workers collection
          profilePhotoUrl: workerData['profilePhotoUrl'] || null,
        };

        // Merge with user data if available
        if (userSnap.exists()) {
          const userData = userSnap.data() as UserData;
          console.log('User data loaded:', userData);

          // Prioritize user collection data for personal information
          this.workerData = {
            ...this.workerData,
            fullName: userData.fullName || this.workerData.fullName,
            email: userData.email,
            phone: userData.phone,
            // If user has profile picture, use it as fallback
            profilePhotoUrl:
              this.workerData.profilePhotoUrl || userData.profilePicture,
          };
        } else {
          console.warn('User data not found for worker ID:', workerId);
        }

        // Set initial location text and fetch detailed address
        if (this.workerData.location.lat !== 0 && this.workerData.location.lng !== 0) {
          this.workerLocationText = this.getAreaDescription(this.workerData.location.lat, this.workerData.location.lng);
          // Fetch detailed address from Google Maps
          this.fetchDetailedAddress(this.workerData.location.lat, this.workerData.location.lng);
        } else {
          this.workerLocationText = 'Location not available';
        }
        
        console.log('Complete worker data:', this.workerData);
        console.log('Initial worker location text:', this.workerLocationText);
      } else {
        console.error('Worker data not found for ID:', workerId);
        this.showToast('Worker information not available', 'warning');
      }
    } catch (error) {
      console.error('Error loading worker data:', error);
      this.showToast('Error loading worker information', 'danger');
    }
  }

  private setupBookingListener() {
    if (!this.bookingId) return;

    const collection = this.isQuickBooking ? 'quickbookings' : 'bookings';
    const bookingRef = doc(this.firestore, `${collection}/${this.bookingId}`);
    this.bookingListener = onSnapshot(bookingRef, (doc) => {
      if (doc.exists()) {
        const updatedBooking = { id: doc.id, ...doc.data() } as BookingData;
        const previousStatus = this.bookingData?.status;
        this.bookingData = updatedBooking;

        // Update status messages for UI
        this.updateStatusMessages();

        // Trigger change detection to update UI immediately
        this.cdr.detectChanges();

        // Handle case where assignedWorker gets populated after booking acceptance
        if (updatedBooking.assignedWorker && !this.workerData) {
          console.log('AssignedWorker field populated, loading worker data...');
          this.loadWorkerData(updatedBooking.assignedWorker);
          this.calculateDistanceAndETA();
          this.initializeWorkerTracking();
          this.isLoading = false;
          // Trigger change detection after loading worker data
          this.cdr.detectChanges();
        }

        // Handle status changes
        console.log('=== BOOKING UPDATE RECEIVED ===');
        console.log('Previous status:', previousStatus);
        console.log('New status:', updatedBooking.status);
        console.log('Assigned worker:', updatedBooking.assignedWorker);
        console.log('Job timer data:', updatedBooking.jobTimer);
        
        switch (updatedBooking.status) {
          case 'accepted':
            // Only show toast if status actually changed to accepted
            if (previousStatus !== 'accepted') {
              this.showToast('Worker has accepted your booking!', 'success');
            }
            this.cdr.detectChanges();
            break;
          case 'on-the-way':
            this.showToast('Worker is on the way to your location!', 'success');
            this.cdr.detectChanges();
            break;
          case 'arrived':
            this.showToast('Worker has arrived at your location!', 'success');
            this.cdr.detectChanges();
            break;
          case 'in-progress':
            // Only show toast if status actually changed to in-progress
            if (previousStatus !== 'in-progress') {
              this.showToast('Worker has started the job!', 'success');
            }
            
            console.log('=== HANDLING IN-PROGRESS STATUS ===');
            console.log('Previous status:', previousStatus);
            console.log('Job timer data:', updatedBooking.jobTimer);
            console.log('Current timer running:', !!this.jobTimer);
            
            // Start job timer if not already running and we have start time
            if (updatedBooking.jobTimer?.startTime && !this.jobTimer) {
              console.log('✅ Starting job timer with start time:', updatedBooking.jobTimer.startTime);
              this.startJobTimer();
            } else if (!updatedBooking.jobTimer?.startTime) {
              console.warn('⚠️ No start time found in job timer, will retry in 2 seconds');
              // Retry after a short delay in case the data hasn't synced yet
              setTimeout(() => {
                if (this.bookingData?.jobTimer?.startTime && this.bookingData.status === 'in-progress' && !this.jobTimer) {
                  console.log('🔄 Retrying timer start with:', this.bookingData.jobTimer.startTime);
                  this.startJobTimer();
                } else if (!this.bookingData?.jobTimer?.startTime) {
                  console.error('❌ Still no start time available after retry');
                } else if (this.jobTimer) {
                  console.log('✅ Timer already running, no need to start');
                }
              }, 2000);
            } else if (this.jobTimer) {
              console.log('✅ Timer already running, no need to start again');
            }
            // Trigger change detection after status change
            this.cdr.detectChanges();
            break;
          case 'completed':
            // Stop timer and show completion modal
            this.stopJobTimer();
            console.log('=== JOB COMPLETED EVENT ===');
            console.log('Job completed, checking completion photo...');
            console.log('Booking ID:', this.bookingId);
            console.log('Is quick booking:', this.isQuickBooking);
            console.log('Updated booking data:', updatedBooking);
            console.log('Completion photo from booking:', updatedBooking.completionPhoto);
            console.log('Final pricing from booking:', updatedBooking.finalPricing);
            
            // Calculate pricing based on actual job duration
            console.log('=== JOB COMPLETION - DURATION ANALYSIS ===');
            console.log('updatedBooking.jobTimer:', updatedBooking.jobTimer);
            console.log('updatedBooking.jobTimer?.duration:', updatedBooking.jobTimer?.duration);
            console.log('updatedBooking.jobTimer?.startTime:', updatedBooking.jobTimer?.startTime);
            console.log('updatedBooking.jobTimer?.endTime:', updatedBooking.jobTimer?.endTime);
            console.log('updatedBooking.finalPricing:', updatedBooking.finalPricing);
            console.log('updatedBooking.finalPricing?.duration:', updatedBooking.finalPricing?.duration);
            
            // Update local booking data with the new data
            this.bookingData = updatedBooking;
            console.log('Updated local bookingData with new data');
            
            if (updatedBooking.jobTimer?.duration) {
              console.log('✅ Found duration in jobTimer:', updatedBooking.jobTimer.duration);
              console.log('Duration type:', typeof updatedBooking.jobTimer.duration);
              console.log('Duration value check:', updatedBooking.jobTimer.duration > 0);
              this.calculateJobPricing(updatedBooking.jobTimer.duration).then(pricing => {
                console.log('=== CLIENT PRICING CALCULATION RESULT ===');
                console.log('Input duration:', updatedBooking.jobTimer?.duration);
                console.log('Calculated pricing result:', pricing);
                console.log('Pricing duration property:', pricing?.duration);
                console.log('Duration formatted:', this.formatDuration(pricing?.duration || 0));
                
                // Ensure duration is included in pricing object
                if (pricing && updatedBooking.jobTimer?.duration) {
                  pricing.duration = updatedBooking.jobTimer.duration;
                  console.log('✅ Ensured duration is set in pricing:', pricing.duration);
                }
                
                this.finalPricing = pricing;
                console.log('Final pricing set to:', this.finalPricing);
                this.cdr.detectChanges();
              });
            } else if (updatedBooking.finalPricing) {
              console.log('✅ Using existing finalPricing from booking:', updatedBooking.finalPricing);
              console.log('Existing finalPricing duration:', updatedBooking.finalPricing.duration);
              this.finalPricing = updatedBooking.finalPricing;
            } else {
              console.log('❌ No duration or finalPricing found, will use fallback in submitRating');
              console.log('Available data in updatedBooking:', Object.keys(updatedBooking));
              console.log('JobTimer exists but no duration:', updatedBooking.jobTimer);
            }
            
            if (updatedBooking.completionPhoto) {
              this.completionPhoto = updatedBooking.completionPhoto;
              this.showCompletionModal = true;
              console.log('Showing completion modal with photo:', this.completionPhoto);
            } else {
              console.warn('No completion photo found, showing modal anyway');
              this.showCompletionModal = true;
            }
            // Trigger change detection after completion updates
            this.cdr.detectChanges();
            break;
          case 'payment-confirmed':
            // Worker has confirmed payment, close payment modal and hide UI elements
            this.showPaymentModal = false;
            this.showPriceBreakdownModal = false;
            this.isPaymentConfirmed = true;
            this.showToast('Payment confirmed! Thank you for using our service.', 'success');
            this.cdr.detectChanges();
            console.log('Payment confirmed - modal closed, UI elements hidden, staying on page');
            break;
          case 'cancelled':
            this.stopJobTimer();
            this.showToast('Booking has been cancelled', 'warning');
            this.cdr.detectChanges();
            this.router.navigate(['/client/dashboard']);
            break;
        }
      }
    });
  }
  private calculateDistanceAndETA() {
    if (!this.bookingData?.location || !this.workerData?.location) return;

    // Calculate distance using Haversine formula
    const R = 6371; // Earth's radius in km
    const lat1 = this.bookingData.location.lat;
    const lng1 = this.bookingData.location.lng;
    const lat2 = this.workerData.location.lat;
    const lng2 = this.workerData.location.lng;

    const dLat = this.deg2rad(lat2 - lat1);
    const dLng = this.deg2rad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    this.distance = R * c;

    // Estimate arrival time (assuming 30 km/h average speed in city)
    const estimatedMinutes = Math.round((this.distance / 30) * 60);
    this.estimatedArrival =
      estimatedMinutes < 60
        ? `${estimatedMinutes} minutes`
        : `${Math.round(estimatedMinutes / 60)} hour${
            estimatedMinutes >= 120 ? 's' : ''
          }`;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Extract worker location from currentLocation field only
   */
  private extractWorkerLocation(workerData: any): { lat: number; lng: number } {
    // Only check for currentLocation (GeoPoint from location tracking)
    if (workerData['currentLocation']) {
      const geoPoint = workerData['currentLocation'];
      if (geoPoint.latitude !== undefined && geoPoint.longitude !== undefined) {
        console.log('Using currentLocation (GeoPoint):', geoPoint);
        console.log('Extracted coordinates:', { lat: geoPoint.latitude, lng: geoPoint.longitude });
        return {
          lat: geoPoint.latitude,
          lng: geoPoint.longitude
        };
      }
    }

    // No fallback - only use currentLocation field
    console.warn('No currentLocation found for worker, location not available');
    return { lat: 0, lng: 0 };
  }

  /**
   * Convert coordinates to readable location text
   */
  convertCoordinatesToLocationText(lat: number, lng: number): string {
    if (lat === 0 && lng === 0) {
      return 'Location not available';
    }

    // Format coordinates to readable text
    const latDirection = lat >= 0 ? 'N' : 'S';
    const lngDirection = lng >= 0 ? 'E' : 'W';
    
    const formattedLat = Math.abs(lat).toFixed(6);
    const formattedLng = Math.abs(lng).toFixed(6);
    
    return `${formattedLat}°${latDirection}, ${formattedLng}°${lngDirection}`;
  }

  /**
   * Get detailed area description based on coordinates (Cities/Municipalities)
   */
  private getAreaDescription(lat: number, lng: number): string {
    console.log('Getting area description for coordinates:', { lat, lng });
    
    if (lat === 0 && lng === 0) {
      return 'Location not available';
    }

    // ========== BATANGAS PROVINCE - DETAILED CITIES/MUNICIPALITIES ==========
    if (lat >= 13.6 && lat <= 14.2 && lng >= 120.8 && lng <= 121.6) {
      // Batangas City (Capital)
      if (lat >= 13.73 && lat <= 13.80 && lng >= 121.03 && lng <= 121.10) {
        console.log('Detected: Batangas City');
        return 'Batangas City, Batangas';
      }
      // Lipa City
      else if (lat >= 13.93 && lat <= 14.00 && lng >= 121.13 && lng <= 121.20) {
        console.log('Detected: Lipa City');
        return 'Lipa City, Batangas';
      }
      // Tanauan City
      else if (lat >= 14.05 && lat <= 14.12 && lng >= 121.13 && lng <= 121.20) {
        console.log('Detected: Tanauan City');
        return 'Tanauan City, Batangas';
      }
      // Santo Tomas
      else if (lat >= 14.08 && lat <= 14.15 && lng >= 121.13 && lng <= 121.20) {
        console.log('Detected: Santo Tomas');
        return 'Santo Tomas, Batangas';
      }
      // Lemery
      else if (lat >= 13.90 && lat <= 13.98 && lng >= 120.88 && lng <= 120.95) {
        console.log('Detected: Lemery');
        return 'Lemery, Batangas';
      }
      // Taal
      else if (lat >= 13.87 && lat <= 13.94 && lng >= 120.90 && lng <= 120.97) {
        console.log('Detected: Taal');
        return 'Taal, Batangas';
      }
      // Balayan
      else if (lat >= 13.92 && lat <= 13.99 && lng >= 120.70 && lng <= 120.77) {
        console.log('Detected: Balayan');
        return 'Balayan, Batangas';
      }
      // Nasugbu
      else if (lat >= 14.05 && lat <= 14.15 && lng >= 120.60 && lng <= 120.70) {
        console.log('Detected: Nasugbu');
        return 'Nasugbu, Batangas';
      }
      // Calatagan
      else if (lat >= 13.82 && lat <= 13.90 && lng >= 120.60 && lng <= 120.68) {
        console.log('Detected: Calatagan');
        return 'Calatagan, Batangas';
      }
      // Mabini
      else if (lat >= 13.70 && lat <= 13.78 && lng >= 120.88 && lng <= 120.95) {
        console.log('Detected: Mabini');
        return 'Mabini, Batangas';
      }
      // San Juan
      else if (lat >= 13.80 && lat <= 13.87 && lng >= 121.38 && lng <= 121.45) {
        console.log('Detected: San Juan');
        return 'San Juan, Batangas';
      }
      // Rosario
      else if (lat >= 13.83 && lat <= 13.90 && lng >= 121.18 && lng <= 121.25) {
        console.log('Detected: Rosario');
        return 'Rosario, Batangas';
      }
      // Ibaan
      else if (lat >= 13.80 && lat <= 13.87 && lng >= 121.10 && lng <= 121.17) {
        console.log('Detected: Ibaan');
        return 'Ibaan, Batangas';
      }
      // General area fallback
      else {
        console.log('Detected: Batangas Province (General Area)');
        return 'Batangas Province';
      }
    }

    // ========== METRO MANILA - DETAILED CITIES ==========
    if (lat >= 14.3 && lat <= 14.8 && lng >= 120.9 && lng <= 121.3) {
      // Quezon City
      if (lat >= 14.60 && lat <= 14.76 && lng >= 121.00 && lng <= 121.15) {
        console.log('Detected: Quezon City');
        return 'Quezon City, Metro Manila';
      }
      // Manila City
      else if (lat >= 14.55 && lat <= 14.62 && lng >= 120.97 && lng <= 121.05) {
        console.log('Detected: Manila City');
        return 'Manila City, Metro Manila';
      }
      // Makati City
      else if (lat >= 14.53 && lat <= 14.58 && lng >= 121.01 && lng <= 121.06) {
        console.log('Detected: Makati City');
        return 'Makati City, Metro Manila';
      }
      // Taguig City
      else if (lat >= 14.50 && lat <= 14.56 && lng >= 121.04 && lng <= 121.10) {
        console.log('Detected: Taguig City');
        return 'Taguig City, Metro Manila';
      }
      // Pasig City
      else if (lat >= 14.55 && lat <= 14.61 && lng >= 121.06 && lng <= 121.12) {
        console.log('Detected: Pasig City');
        return 'Pasig City, Metro Manila';
      }
      // Mandaluyong City
      else if (lat >= 14.57 && lat <= 14.60 && lng >= 121.03 && lng <= 121.06) {
        console.log('Detected: Mandaluyong City');
        return 'Mandaluyong City, Metro Manila';
      }
      // San Juan City
      else if (lat >= 14.59 && lat <= 14.61 && lng >= 121.03 && lng <= 121.05) {
        console.log('Detected: San Juan City');
        return 'San Juan City, Metro Manila';
      }
      // Caloocan City
      else if (lat >= 14.64 && lat <= 14.75 && lng >= 120.96 && lng <= 121.05) {
        console.log('Detected: Caloocan City');
        return 'Caloocan City, Metro Manila';
      }
      // Malabon City
      else if (lat >= 14.65 && lat <= 14.68 && lng >= 120.95 && lng <= 120.98) {
        console.log('Detected: Malabon City');
        return 'Malabon City, Metro Manila';
      }
      // Navotas City
      else if (lat >= 14.66 && lat <= 14.68 && lng >= 120.93 && lng <= 120.96) {
        console.log('Detected: Navotas City');
        return 'Navotas City, Metro Manila';
      }
      // Valenzuela City
      else if (lat >= 14.68 && lat <= 14.73 && lng >= 120.97 && lng <= 121.02) {
        console.log('Detected: Valenzuela City');
        return 'Valenzuela City, Metro Manila';
      }
      // Marikina City
      else if (lat >= 14.63 && lat <= 14.68 && lng >= 121.09 && lng <= 121.13) {
        console.log('Detected: Marikina City');
        return 'Marikina City, Metro Manila';
      }
      else {
        console.log('Detected: Metro Manila (General Area)');
        return 'Metro Manila';
      }
    }

    // ========== SOUTHERN METRO MANILA ==========
    if (lat >= 14.1 && lat <= 14.3 && lng >= 120.9 && lng <= 121.2) {
      // Muntinlupa City
      if (lat >= 14.37 && lat <= 14.43 && lng >= 121.03 && lng <= 121.08) {
        console.log('Detected: Muntinlupa City');
        return 'Muntinlupa City, Metro Manila';
      }
      // Las Piñas City
      else if (lat >= 14.43 && lat <= 14.48 && lng >= 120.98 && lng <= 121.03) {
        console.log('Detected: Las Piñas City');
        return 'Las Piñas City, Metro Manila';
      }
      // Parañaque City
      else if (lat >= 14.47 && lat <= 14.52 && lng >= 121.00 && lng <= 121.05) {
        console.log('Detected: Parañaque City');
        return 'Parañaque City, Metro Manila';
      }
      // Pasay City
      else if (lat >= 14.53 && lat <= 14.56 && lng >= 120.99 && lng <= 121.02) {
        console.log('Detected: Pasay City');
        return 'Pasay City, Metro Manila';
      }
      else {
        console.log('Detected: Southern Metro Manila');
        return 'Southern Metro Manila';
      }
    }

    // ========== CAVITE PROVINCE - DETAILED CITIES/MUNICIPALITIES ==========
    if (lat >= 14.0 && lat <= 14.5 && lng >= 120.6 && lng <= 121.1) {
      // Cavite City
      if (lat >= 14.47 && lat <= 14.50 && lng >= 120.88 && lng <= 120.91) {
        console.log('Detected: Cavite City');
        return 'Cavite City, Cavite';
      }
      // Bacoor City
      else if (lat >= 14.45 && lat <= 14.48 && lng >= 120.93 && lng <= 120.97) {
        console.log('Detected: Bacoor City');
        return 'Bacoor City, Cavite';
      }
      // Imus City
      else if (lat >= 14.40 && lat <= 14.44 && lng >= 120.93 && lng <= 120.97) {
        console.log('Detected: Imus City');
        return 'Imus City, Cavite';
      }
      // Dasmariñas City
      else if (lat >= 14.30 && lat <= 14.35 && lng >= 120.93 && lng <= 120.98) {
        console.log('Detected: Dasmariñas City');
        return 'Dasmariñas City, Cavite';
      }
      // Tagaytay City
      else if (lat >= 14.10 && lat <= 14.13 && lng >= 120.93 && lng <= 120.97) {
        console.log('Detected: Tagaytay City');
        return 'Tagaytay City, Cavite';
      }
      // General Trias
      else if (lat >= 14.37 && lat <= 14.40 && lng >= 120.87 && lng <= 120.91) {
        console.log('Detected: General Trias');
        return 'General Trias, Cavite';
      }
      else {
        console.log('Detected: Cavite Province');
        return 'Cavite Province';
      }
    }

    // ========== LAGUNA PROVINCE - DETAILED CITIES/MUNICIPALITIES ==========
    if (lat >= 14.0 && lat <= 14.6 && lng >= 121.2 && lng <= 121.8) {
      // Santa Rosa City
      if (lat >= 14.30 && lat <= 14.33 && lng >= 121.10 && lng <= 121.13) {
        console.log('Detected: Santa Rosa City');
        return 'Santa Rosa City, Laguna';
      }
      // Biñan City
      else if (lat >= 14.32 && lat <= 14.35 && lng >= 121.07 && lng <= 121.10) {
        console.log('Detected: Biñan City');
        return 'Biñan City, Laguna';
      }
      // San Pedro City
      else if (lat >= 14.35 && lat <= 14.37 && lng >= 121.05 && lng <= 121.08) {
        console.log('Detected: San Pedro City');
        return 'San Pedro City, Laguna';
      }
      // Calamba City
      else if (lat >= 14.20 && lat <= 14.23 && lng >= 121.15 && lng <= 121.18) {
        console.log('Detected: Calamba City');
        return 'Calamba City, Laguna';
      }
      // Los Baños
      else if (lat >= 14.16 && lat <= 14.19 && lng >= 121.22 && lng <= 121.25) {
        console.log('Detected: Los Baños');
        return 'Los Baños, Laguna';
      }
      else {
        console.log('Detected: Laguna Province');
        return 'Laguna Province';
      }
    }
    
    // Broader Philippines area
    if (lat >= 4.0 && lat <= 21.0 && lng >= 116.0 && lng <= 127.0) {
      return 'Philippines';
    }
    
    return `${this.convertCoordinatesToLocationText(lat, lng)}`;
  }

  /**
   * Fetch detailed address from Nominatim (OpenStreetMap) - FREE Alternative
   */
  async fetchDetailedAddress(lat: number, lng: number): Promise<void> {
    if (lat === 0 && lng === 0) {
      console.warn('Invalid coordinates for address lookup');
      return;
    }

    this.isLoadingAddress = true;
    // Using Nominatim (OpenStreetMap) - Completely FREE, no API key needed
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;

    try {
      console.log('Fetching detailed address from Nominatim (OpenStreetMap)...');
      console.log('API URL:', url);
      console.log('Coordinates:', { lat, lng });
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'HandyHome/1.0' // Required by Nominatim usage policy
        }
      });
      const data = await response.json();

      console.log('Nominatim API Response:', data);

      if (data && data.address) {
        const addr = data.address;
        
        console.log('Address components:', addr);

        // Parse Nominatim address components
        const street = addr.road || addr.street || '';
        const barangay = addr.suburb || addr.neighbourhood || addr.village || '';
        const city = addr.city || addr.town || addr.municipality || '';
        const province = addr.state || addr.province || '';
        const postalCode = addr.postcode || '';
        
        // Find nearby landmark from amenity, shop, or building
        let nearbyLandmark = '';
        if (addr.amenity) {
          nearbyLandmark = `Near ${addr.amenity}`;
        } else if (addr.shop) {
          nearbyLandmark = `Near ${addr.shop} shop`;
        } else if (addr.building) {
          nearbyLandmark = `Near ${addr.building}`;
        }

        this.workerDetailedAddress = {
          formattedAddress: data.display_name,
          street: street || undefined,
          barangay: barangay || undefined,
          city: city || undefined,
          province: province || undefined,
          postalCode: postalCode || undefined,
          nearbyLandmark: nearbyLandmark || undefined,
          placeId: data.place_id?.toString()
        };

        console.log('Detailed address fetched:', this.workerDetailedAddress);
      } else if (data && data.error) {
        console.error('Nominatim API Error:', data.error);
        this.workerDetailedAddress = {
          formattedAddress: 'Address not available - ' + data.error,
        };
      } else {
        console.warn('No address found for coordinates');
        this.workerDetailedAddress = {
          formattedAddress: 'No address found for this location',
        };
      }
    } catch (error) {
      console.error('Error fetching address from Nominatim:', error);
      console.error('Error details:', error);
      this.workerDetailedAddress = {
        formattedAddress: 'Unable to fetch address - Network error',
      };
    } finally {
      this.isLoadingAddress = false;
    }
  }

  /**
   * Get detailed location information for display
   */
  getWorkerLocationDetails(): { area: string; coordinates: string; isAvailable: boolean } {
    if (!this.workerData?.location || (this.workerData.location.lat === 0 && this.workerData.location.lng === 0)) {
      return {
        area: 'Location not available',
        coordinates: '',
        isAvailable: false
      };
    }

    const { lat, lng } = this.workerData.location;
    return {
      area: this.getAreaDescription(lat, lng),
      coordinates: this.convertCoordinatesToLocationText(lat, lng),
      isAvailable: true
    };
  }

  async contactWorker() {
    if (!this.workerData) return;

    const buttons: any[] = [];

    // Add call option if phone number is available
    if (this.workerData.phone) {
      buttons.push({
        text: `Call ${this.workerData.phone}`,
        icon: 'call',
        handler: () => {
          this.callWorker();
        },
      });
    }

    // Add message option if phone number is available
    if (this.workerData.phone) {
      buttons.push({
        text: 'Send SMS',
        icon: 'chatbubble',
        handler: () => {
          this.messageWorker();
        },
      });
    }

    // Add email option if email is available
    if (this.workerData.email) {
      buttons.push({
        text: `Email ${this.workerData.email}`,
        icon: 'mail',
        handler: () => {
          this.emailWorker();
        },
      });
    }

    // Always add location option
    buttons.push({
      text: 'View Location on Map',
      icon: 'location',
      handler: () => {
        this.openWorkerLocation();
      },
    });

    // Add cancel button
    buttons.push({
      text: 'Cancel',
      icon: 'close',
      role: 'cancel',
    });

    // Show message if no contact methods available
    if (!this.workerData.phone && !this.workerData.email) {
      await this.showToast(
        'No contact information available for this worker',
        'warning'
      );
      return;
    }

    const actionSheet = await this.actionSheetController.create({
      header: `Contact ${this.workerData.fullName}`,
      buttons: buttons,
    });

    await actionSheet.present();
  }

  callWorker() {
    if (this.workerData?.phone) {
      window.open(`tel:${this.workerData.phone}`, '_system');
    } else {
      this.showToast('Worker phone number not available', 'warning');
    }
  }

  messageWorker() {
    if (this.workerData?.phone) {
      const message = `Hi ${this.workerData.fullName}, I'm your client for the ${this.bookingData?.categoryName} service. Looking forward to working with you!`;
      window.open(
        `sms:${this.workerData.phone}?body=${encodeURIComponent(message)}`,
        '_system'
      );
    } else {
      this.showToast('Worker phone number not available', 'warning');
    }
  }

  private emailWorker() {
    if (this.workerData?.email) {
      const subject = `HandyHome Service: ${this.bookingData?.categoryName}`;
      const body = `Hi ${this.workerData.fullName},\n\nI'm your client for the ${this.bookingData?.categoryName} service (${this.bookingData?.subService}).\n\nBooking Details:\n- Service: ${this.bookingData?.subService}\n- Location: ${this.bookingData?.location?.address}\n- Booking ID: ${this.bookingData?.id}\n\nLooking forward to working with you!\n\nBest regards`;

      const mailtoUrl = `mailto:${
        this.workerData.email
      }?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
        body
      )}`;
      window.open(mailtoUrl, '_system');
    } else {
      this.showToast('Worker email not available', 'warning');
    }
  }

  private openWorkerLocation() {
    if (this.workerData?.location) {
      const { lat, lng } = this.workerData.location;
      const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      window.open(url, '_system');
    }
  }

  async cancelBooking() {
    const alert = await this.alertController.create({
      header: 'Cancel Booking',
      message:
        'Are you sure you want to cancel this booking? The worker has already been assigned.',
      buttons: [
        {
          text: 'No, Keep Booking',
          role: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          role: 'destructive',
          handler: async () => {
            await this.performCancelBooking();
          },
        },
      ],
    });

    await alert.present();
  }

  private async performCancelBooking() {
    try {
      // TODO: Update booking status to cancelled
      // TODO: Notify worker about cancellation
      // TODO: Handle any cancellation fees

      await this.showToast('Booking cancelled successfully', 'success');
      this.router.navigate(['/client/dashboard']);
    } catch (error) {
      console.error('Error cancelling booking:', error);
      await this.showToast('Error cancelling booking', 'danger');
    }
  }

  getWorkerInitials(): string {
    if (!this.workerData?.fullName) return 'W';
    return this.workerData.fullName
      .split(' ')
      .map((n) => n.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  getWorkerProfileImageSrc(): string | null {
    if (this.workerData?.profilePhotoData) {
      // Handle base64 image data from workers collection
      const base64Data = this.workerData.profilePhotoData;
      // Check if the base64 data already includes the data URL prefix
      if (base64Data.startsWith('data:image/')) {
        return base64Data;
      } else {
        // Add the data URL prefix for JPEG images
        return `data:image/jpeg;base64,${base64Data}`;
      }
    } else if (this.workerData?.profilePhotoUrl) {
      // Fallback to profile photo URL
      return this.workerData.profilePhotoUrl;
    }
    return null;
  }

  hasWorkerProfileImage(): boolean {
    return !!(
      this.workerData?.profilePhotoData || this.workerData?.profilePhotoUrl
    );
  }

  onImageError(event: any): void {
    console.warn('Failed to load worker profile image:', event);
    // Hide the failed image by setting display to none
    event.target.style.display = 'none';
    // Optionally show a toast message
    // this.showToast('Failed to load profile image', 'warning');
  }

  getStatusColor(): string {
    switch (this.bookingData?.status) {
      case 'accepted':
        return 'success';
      case 'in_progress':
        return 'warning';
      case 'completed':
        return 'primary';
      default:
        return 'medium';
    }
  }

  getStatusText(): string {
    switch (this.bookingData?.status) {
      case 'accepted':
        return 'Worker Assigned';
      case 'in_progress':
        return 'Job In Progress';
      case 'completed':
        return 'Job Completed';
      default:
        return 'Unknown Status';
    }
  }

  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'warning' | 'primary' | 'medium'
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  /**
   * Initialize worker tracking for real-time location updates
   */
  private initializeWorkerTracking(): void {
    if (!this.bookingId) return;

    // Start tracking the worker for this booking
    this.trackingSubscription = this.workerTrackingService
      .startTracking(this.bookingId)
      .subscribe({
        next: (trackingData) => {
          if (trackingData) {
            this.trackingData = trackingData;
            this.updateMapDisplay();
            this.updateDistanceAndETA();
          }
        },
        error: (error) => {
          console.error('Error in worker tracking:', error);
          this.showToast('Error tracking worker location', 'danger');
        },
      });
  }

  /**
   * Update map display with current worker and client locations
   */
  private updateMapDisplay(): void {
    if (!this.trackingData || !this.trackingData.worker.location) return;

    const workerLocation = this.trackingData.worker.location;
    const clientLocation = this.trackingData.client.location;

    // Update map center to midpoint between worker and client
    this.mapCoordinates = {
      lat: (workerLocation.lat + clientLocation.lat) / 2,
      lng: (workerLocation.lng + clientLocation.lng) / 2,
    };

    // Update map pins with both coordinate formats for compatibility
    this.mapPins = [
      {
        position: { lat: workerLocation.lat, lng: workerLocation.lng },
        coordinates: {
          latitude: workerLocation.lat,
          longitude: workerLocation.lng,
        },
        label: this.trackingData.worker.fullName,
        title: `${this.trackingData.worker.fullName} (Worker)`,
        color: 'primary',
      },
      {
        position: { lat: clientLocation.lat, lng: clientLocation.lng },
        coordinates: {
          latitude: clientLocation.lat,
          longitude: clientLocation.lng,
        },
        label: 'Your Location',
        title: 'Your Location (Client)',
        color: 'danger',
      },
    ];

    // Update trace path
    this.tracePath = [
      { lat: workerLocation.lat, lng: workerLocation.lng },
      { lat: clientLocation.lat, lng: clientLocation.lng },
    ];

    this.showMap = true;
  }

  /**
   * Update distance and ETA from tracking data
   */
  private updateDistanceAndETA(): void {
    if (!this.trackingData) return;

    this.distance = this.trackingData.distance;
    this.estimatedArrival = `${this.trackingData.estimatedTravelTime} min`;
  }

  /**
   * Toggle map visibility
   */
  toggleMap(): void {
    this.showMap = !this.showMap;
  }

  /**
   * Handle map coordinate changes (placeholder for future map integration)
   */
  onMapCoordinatesChange(coordinates: any): void {
    // Placeholder for future map integration
    console.log('Map coordinates changed:', coordinates);
  }

  /**
   * Center map on worker location
   */
  centerMapOnWorker(): void {
    if (this.trackingData?.worker.location) {
      this.mapCoordinates = {
        lat: this.trackingData.worker.location.lat,
        lng: this.trackingData.worker.location.lng,
      };
    }
  }

  /**
   * Fit map to show both worker and client locations
   */
  fitMapToAll(): void {
    if (this.trackingData) {
      // The map component will auto-fit based on all pins
      this.updateMapDisplay();
    }
  }

  /**
   * Get dynamic status message
   */
  getTrackingStatusMessage(): string {
    return this.trackingData?.statusMessage || 'Locating worker...';
  }

  /**
   * Get time since last location update
   */
  getLastUpdateTime(): string {
    return this.workerTrackingService.getTimeSinceLastUpdate();
  }

  /**
   * Refresh worker location manually
   */
  async refreshWorkerLocation(): Promise<void> {
    if (this.trackingData?.worker.uid) {
      await this.workerTrackingService.refreshWorkerLocation(
        this.trackingData.worker.uid
      );
      this.showToast('Location refreshed', 'success');
    }
  }

  /**
   * Get formatted distance string
   */
  getFormattedDistance(): string {
    if (!this.trackingData) return 'Calculating...';

    const distance = this.trackingData.distance;
    if (distance >= 1) {
      return `${distance.toFixed(1)} km away`;
    } else {
      return `${(distance * 1000).toFixed(0)} m away`;
    }
  }

  /**
   * Get ETA color based on distance
   */
  getETAColor(): string {
    if (!this.trackingData) return 'medium';

    const minutes = this.trackingData.estimatedTravelTime;
    if (minutes <= 5) return 'success';
    if (minutes <= 15) return 'warning';
    return 'primary';
  }

  // ===============================================================
  // 🚀 Enhanced Methods for Real-time Tracking
  // ===============================================================

  private async loadBookingData() {
    try {
      console.log('=== LOADING BOOKING DATA ===');
      console.log('Booking ID:', this.bookingId);
      console.log('Is Quick Booking:', this.isQuickBooking);
      
      // First, try to determine the correct collection by checking both
      let bookingSnap: any = null;
      let collectionName = '';
      
      // Try quickbookings first
      const quickBookingRef = doc(this.firestore, `quickbookings/${this.bookingId}`);
      const quickBookingSnap = await getDoc(quickBookingRef);
      
      if (quickBookingSnap.exists()) {
        console.log('Found booking in quickbookings collection');
        bookingSnap = quickBookingSnap;
        collectionName = 'quickbookings';
        this.isQuickBooking = true;
      } else {
        // Try regular bookings
        const regularBookingRef = doc(this.firestore, `bookings/${this.bookingId}`);
        const regularBookingSnap = await getDoc(regularBookingRef);
        
        if (regularBookingSnap.exists()) {
          console.log('Found booking in bookings collection');
          bookingSnap = regularBookingSnap;
          collectionName = 'bookings';
          this.isQuickBooking = false;
        }
      }

      if (bookingSnap && bookingSnap.exists()) {
        const data = bookingSnap.data();
        console.log('Booking data loaded:', data);
        
        this.bookingData = {
          id: bookingSnap.id,
          ...data,
        } as BookingData;

        if (this.bookingData.assignedWorker) {
          console.log('Loading worker data for:', this.bookingData.assignedWorker);
          await this.loadWorkerData(this.bookingData.assignedWorker);
        } else {
          console.log('No assigned worker yet, status:', this.bookingData.status);
        }

        // Fetch client/service location address from Nominatim
        if (this.bookingData.location?.lat && this.bookingData.location?.lng) {
          this.fetchClientLocationAddress(
            this.bookingData.location.lat,
            this.bookingData.location.lng
          );
        }

        this.updateStatusMessages();
        
        // Check if job is already in progress and start timer if needed
        if (this.bookingData.status === 'in-progress' && this.bookingData.jobTimer?.startTime) {
          console.log('Job already in progress, starting timer');
          this.startJobTimer();
        }
        
        this.isLoading = false;
      } else {
        console.error('Booking not found in either collection');
        console.error('Checked collections: quickbookings, bookings');
        console.error('Booking ID:', this.bookingId);
        throw new Error('Booking not found in any collection');
      }
    } catch (error) {
      console.error('Error loading booking data:', error);
      this.isLoading = false;
      throw error;
    }
  }

  private setupRealtimeBookingListener() {
    // This method is now consolidated with the main booking listener
    // All booking updates are handled in the main setupRealtimeListener method
    console.log('setupRealtimeBookingListener called - using main listener instead');
  }

  private startLocationTracking() {
    if (!this.bookingData?.assignedWorker) return;

    // Start real-time worker tracking
    this.trackingSubscription = this.workerTrackingService
      .startTracking(this.bookingData.assignedWorker)
      .subscribe((trackingData) => {
        this.trackingData = trackingData;
        this.updateMapDisplay();
        this.updateStatusMessages();
      });

    // Set up real-time listener for worker's currentLocation updates
    this.setupWorkerLocationListener(this.bookingData.assignedWorker);

    // Set up periodic location refresh
    this.refreshTimer = window.setInterval(() => {
      this.refreshWorkerLocation();
    }, 30000); // Refresh every 30 seconds
  }

  /**
   * Set up real-time listener for worker's currentLocation updates
   */
  private setupWorkerLocationListener(workerId: string): void {
    const workerRef = doc(this.firestore, `workers/${workerId}`);
    
    // Listen for real-time updates to worker's currentLocation
    const locationListener = onSnapshot(workerRef, (doc) => {
      if (doc.exists() && this.workerData) {
        const workerData = doc.data();
        const newLocation = this.extractWorkerLocation(workerData);
        
        // Update worker location if it has changed
        if (newLocation.lat !== 0 && newLocation.lng !== 0) {
          const oldLocation = this.workerData.location;
          if (oldLocation.lat !== newLocation.lat || oldLocation.lng !== newLocation.lng) {
            console.log('Worker location updated in real-time:', newLocation);
            this.workerData.location = newLocation;
            
            // Update location text
            this.workerLocationText = this.getAreaDescription(newLocation.lat, newLocation.lng);
            console.log('Worker location text updated:', this.workerLocationText);
            
            // Fetch updated detailed address from Google Maps
            this.fetchDetailedAddress(newLocation.lat, newLocation.lng);
            
            // Recalculate distance and ETA
            this.calculateDistanceAndETA();
            this.updateStatusMessages();
          }
        } else {
          this.workerLocationText = 'Location not available';
        }
      }
    });

    // Store the listener for cleanup
    if (!this.trackingSubscription) {
      this.trackingSubscription = new Subscription();
    }
    this.trackingSubscription.add(() => locationListener());
  }

  private updateStatusMessages() {
    if (!this.bookingData) return;

    // Update booking status message
    switch (this.bookingData.status) {
      case 'accepted':
        this.bookingStatusMessage =
          'Worker has accepted your booking and is preparing to head to your location.';
        break;
      case 'on-the-way':
        this.bookingStatusMessage = 'Worker is on the way to your location.';
        break;
      case 'arrived':
        this.bookingStatusMessage = 'Worker has arrived at your location and is getting ready to start.';
        break;
      case 'in-progress':
        this.bookingStatusMessage =
          'Worker is currently working on your request.';
        break;
      case 'completed':
        this.bookingStatusMessage = 'Job completed successfully!';
        break;
      default:
        this.bookingStatusMessage = 'Tracking your booking...';
    }

    // Update worker distance message based on status and location
    if (this.bookingData.status === 'completed') {
      this.workerDistanceMessage = 'Job completed successfully!';
    } else if (this.bookingData.status === 'in-progress') {
      this.workerDistanceMessage = 'Worker is currently working on your request.';
    } else if (this.bookingData.status === 'arrived') {
      this.workerDistanceMessage = 'Worker has arrived and is preparing to start.';
    } else if (this.trackingData) {
      const distance = this.trackingData.distance || 0;
      if (this.bookingData.status === 'on-the-way') {
        if (distance > 2) {
          this.workerDistanceMessage = 'Worker is traveling to your location.';
        } else if (distance > 0.5) {
          this.workerDistanceMessage = 'Worker is nearby, get ready!';
        } else {
          this.workerDistanceMessage = 'Worker is about to arrive.';
        }
      } else if (this.bookingData.status === 'accepted') {
        this.workerDistanceMessage = 'Worker is preparing to head to your location.';
      } else {
        this.workerDistanceMessage = 'Tracking worker location...';
      }
    } else {
      this.workerDistanceMessage = 'Locating worker...';
    }
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return distance;
  }




  async reportWorker() {
    if (!this.workerData || !this.bookingData) {
      await this.showToast('Unable to report worker at this time', 'warning');
      return;
    }

    const modal = await this.modalController.create({
      component: ReportWorkerModalComponent,
      componentProps: {
        workerId: this.workerData.uid,
        workerName: this.workerData.fullName,
        bookingId: this.bookingId,
      },
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data?.success) {
      await this.showToast('Report submitted successfully', 'success');
    }
  }

  async processPayment() {
    if (!this.workerData || !this.bookingData) {
      await this.showToast('Unable to process payment at this time', 'warning');
      return;
    }

    // Check if payment can be processed
    const canPay = await this.paymentService.canProcessPayment(this.bookingId);
    if (!canPay.canPay) {
      await this.showToast(
        canPay.reason || 'Cannot process payment',
        'warning'
      );
      return;
    }

    const modal = await this.modalController.create({
      component: PaymentModalComponent,
      componentProps: {
        bookingId: this.bookingId,
        workerId: this.workerData.uid,
        workerName: this.workerData.fullName,
        amount: this.bookingData.pricing.total,
        breakdown: {
          basePrice: this.bookingData.pricing.basePrice,
          serviceCharge: this.bookingData.pricing.serviceCharge,
          transportFee: this.getTransportFee(),
        },
      },
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data?.success) {
      await this.showToast('Payment completed successfully!', 'success');
      // Refresh booking data to show payment status
      this.loadBookingData();
    }
  }

  goBack() {
    this.router.navigate(['/client/dashboard']);
  }

  /**
   * Get transport fee with default value of 50 pesos
   */
  getTransportFee(): number {
    return this.bookingData?.pricing?.transportFee || 50;
  }

  /**
   * Check if booking status has reached or passed a certain stage
   */
  hasReachedStatus(targetStatus: string): boolean {
    if (!this.bookingData?.status) return false;
    
    const statusOrder = ['accepted', 'on-the-way', 'arrived', 'in-progress', 'completed'];
    const currentIndex = statusOrder.indexOf(this.bookingData.status);
    const targetIndex = statusOrder.indexOf(targetStatus);
    
    return currentIndex >= targetIndex;
  }

  /**
   * Get status badge color class
   */
  getStatusBadgeClass(): string {
    switch (this.bookingData?.status) {
      case 'accepted':
        return 'bg-blue-100 text-blue-800';
      case 'on-the-way':
        return 'bg-yellow-100 text-yellow-800';
      case 'arrived':
        return 'bg-orange-100 text-orange-800';
      case 'in-progress':
        return 'bg-purple-100 text-purple-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  /**
   * Get status display text
   */
  getStatusDisplayText(): string {
    switch (this.bookingData?.status) {
      case 'accepted':
        return 'Worker Assigned';
      case 'on-the-way':
        return 'On the Way';
      case 'arrived':
        return 'Arrived';
      case 'in-progress':
        return 'Working';
      case 'completed':
        return 'Completed';
      default:
        return 'Processing';
    }
  }

  /**
   * Format duration from seconds to HH:MM:SS
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

  /**
   * Calculate pricing based on duration and job details
   */
  async calculateJobPricing(durationInSeconds: number): Promise<any> {
    console.log('=== CALCULATING JOB PRICING ===');
    console.log('Duration in seconds:', durationInSeconds);
    console.log('Duration in minutes:', durationInSeconds / 60);
    console.log('Duration in hours:', durationInSeconds / 3600);

    if (!this.bookingData) {
      console.error('No booking data available for pricing calculation');
      return null;
    }

    if (!durationInSeconds || durationInSeconds <= 0) {
      console.warn('Invalid duration provided:', durationInSeconds);
      console.log('Checking bookingData for duration...');
      console.log('bookingData.jobTimer:', this.bookingData.jobTimer);
      console.log('bookingData.jobTimer?.duration:', this.bookingData.jobTimer?.duration);
    }

    try {
      // Get service category details to check pricing type
      const categoryId = (this.bookingData as any).categoryId;
      if (!categoryId) {
        console.error('No category ID found in booking');
        return this.bookingData.pricing;
      }

      const categoryRef = doc(this.firestore, 'serviceCategories', categoryId);
      const categoryDoc = await getDoc(categoryRef);
      
      if (!categoryDoc.exists()) {
        console.error('Service category not found');
        return this.bookingData.pricing;
      }
      
      const categoryData = categoryDoc.data();
      const subService = categoryData?.['subServices']?.find((sub: any) => 
        sub.name === this.bookingData?.subService
      );
      
      if (!subService) {
        console.error('Sub-service not found');
        return this.bookingData.pricing;
      }
      
      console.log('Sub-service data:', subService);
      console.log('Job duration in seconds:', durationInSeconds);
      
      const basePrice = subService.price || this.bookingData.pricing?.basePrice || 0;
      const pricingType = subService.pricingType || 'fixed';
      
      let calculatedBasePrice = basePrice;
      
      if (pricingType === 'hourly' || pricingType === '/hr') {
        // Calculate hourly rate
        const hoursWorked = durationInSeconds / 3600;
        const minimumHours = 1;
        const roundedHours = Math.max(Math.ceil(hoursWorked * 4) / 4, minimumHours); // Round to nearest 15 minutes, minimum 1 hour
        
        calculatedBasePrice = roundedHours * basePrice;
        console.log(`Hourly calculation: ${roundedHours} hours × ₱${basePrice} = ₱${calculatedBasePrice}`);
        
      } else if (pricingType === 'daily' || pricingType === '/day') {
        // Calculate daily rate
        const hoursWorked = durationInSeconds / 3600;
        const daysWorked = hoursWorked / 8; // Assuming 8-hour work day
        const minimumDays = 0.5; // Minimum half day
        const roundedDays = Math.max(Math.ceil(daysWorked * 2) / 2, minimumDays); // Round to nearest half day
        
        calculatedBasePrice = roundedDays * basePrice;
        console.log(`Daily calculation: ${roundedDays} days × ₱${basePrice} = ₱${calculatedBasePrice}`);
        
      } else {
        // Fixed pricing - use original base price
        calculatedBasePrice = basePrice;
        console.log(`Fixed pricing: ₱${calculatedBasePrice}`);
      }
      
      // Calculate fees
      const serviceCharge = calculatedBasePrice * 0.10; // 10% service charge
      const transportFee = 50; // Fixed transport fee as requested
      const total = calculatedBasePrice + serviceCharge + transportFee;
      
      // Worker earnings = base price + transport fee (no service charge for worker)
      const workerEarnings = calculatedBasePrice + transportFee;
      
      const pricing = {
        basePrice: calculatedBasePrice,
        serviceCharge: serviceCharge,
        transportFee: transportFee,
        total: total,
        workerEarnings: workerEarnings,
        pricingType: pricingType,
        duration: durationInSeconds,
        originalBasePrice: this.bookingData.pricing?.basePrice || 0
      };
      
      console.log('Job pricing calculated:', pricing);
      return pricing;
      
    } catch (error) {
      console.error('Error calculating job pricing:', error);
      return this.bookingData?.pricing || null;
    }
  }

  /**
   * View completion photo in full screen
   */
  async viewFullPhoto() {
    if (!this.bookingData?.completionPhoto) return;
    
    const alert = await this.alertController.create({
      header: 'Job Completion Photo',
      message: `
        <div style="text-align: center;">
          <img src="${this.bookingData.completionPhoto}" 
               style="width: 100%; max-width: 300px; border-radius: 8px;" 
               alt="Completion photo">
        </div>
      `,
      buttons: ['Close']
    });
    
    await alert.present();
  }

  /**
   * Start job timer for client display
   */
  startJobTimer() {
    console.log('startJobTimer called');
    console.log('Booking data:', this.bookingData);
    console.log('Job timer:', this.bookingData?.jobTimer);
    console.log('Start time:', this.bookingData?.jobTimer?.startTime);
    
    if (!this.bookingData?.jobTimer?.startTime) {
      console.error('Cannot start timer: no start time available');
      return;
    }
    
    // Stop existing timer if running
    if (this.jobTimer) {
      console.log('Stopping existing timer');
      clearInterval(this.jobTimer);
    }
    
    console.log('Starting new timer interval');
    this.jobTimer = setInterval(() => {
      try {
        const startTime = this.bookingData?.jobTimer?.startTime?.toDate?.() || new Date(this.bookingData?.jobTimer?.startTime);
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;
        
        this.elapsedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        console.log('Timer updated:', this.elapsedTime);
      } catch (error) {
        console.error('Error in timer interval:', error);
      }
    }, 1000);
    
    console.log('Timer started successfully');
  }

  /**
   * Stop job timer
   */
  stopJobTimer() {
    if (this.jobTimer) {
      clearInterval(this.jobTimer);
      this.jobTimer = null;
    }
  }

  /**
   * Submit client rating and review
   */
  async submitRating() {
    if (this.clientRating === 0) {
      this.showToast('Please provide a rating', 'warning');
      return;
    }

    try {
      // Update booking with client rating
      const collection = this.isQuickBooking ? 'quickbookings' : 'bookings';
      const bookingRef = doc(this.firestore, `${collection}/${this.bookingId}`);
      
      await updateDoc(bookingRef, {
        clientRating: this.clientRating,
        clientReview: this.clientReview,
        ratedAt: new Date()
      });

      this.showRatingModal = false;
      this.showCompletionModal = false; // Close the completion modal
      this.hasRatedWorker = true; // Mark that worker has been rated
      
      // If we don't have finalPricing yet, try to calculate it or use existing pricing
      if (!this.finalPricing && this.bookingData?.finalPricing) {
        console.log('Using existing finalPricing from bookingData:', this.bookingData.finalPricing);
        this.finalPricing = this.bookingData.finalPricing;
      } else if (!this.finalPricing) {
        // Try to calculate pricing with actual duration first
        const actualDuration = this.bookingData?.jobTimer?.duration || 0;
        console.log('=== DURATION DEBUGGING IN SUBMIT RATING ===');
        console.log('bookingData:', this.bookingData);
        console.log('bookingData.jobTimer:', this.bookingData?.jobTimer);
        console.log('bookingData.jobTimer.duration:', this.bookingData?.jobTimer?.duration);
        console.log('actualDuration extracted:', actualDuration);
        console.log('finalPricing before calculation:', this.finalPricing);
        
        if (actualDuration > 0) {
          // Calculate dynamic pricing based on actual duration
          console.log('Duration > 0, attempting to calculate pricing...');
          try {
            this.finalPricing = await this.calculateJobPricing(actualDuration);
            console.log('Successfully calculated pricing:', this.finalPricing);
          } catch (error) {
            console.error('Error calculating pricing, using fallback:', error);
            this.finalPricing = null; // Will use fallback below
          }
        } else {
          console.log('Duration is 0 or undefined, skipping dynamic pricing calculation');
        }
        
        // Fallback to original pricing if calculation failed or no duration
        if (!this.finalPricing) {
          console.log('Using fallback pricing with duration:', actualDuration);
          
          this.finalPricing = {
            basePrice: this.bookingData?.pricing?.basePrice || 0,
            serviceCharge: (this.bookingData?.pricing?.basePrice || 0) * 0.1,
            transportFee: 50,
            total: (this.bookingData?.pricing?.basePrice || 0) * 1.1 + 50,
            workerEarnings: (this.bookingData?.pricing?.basePrice || 0) + 50,
            pricingType: 'fixed',
            duration: actualDuration,
            originalBasePrice: this.bookingData?.pricing?.basePrice || 0
          };
        }
        
        // Final check: ensure duration is set in finalPricing
        if (this.finalPricing && actualDuration > 0 && (!this.finalPricing.duration || this.finalPricing.duration === 0)) {
          console.log('⚠️ Final pricing missing duration, setting it manually:', actualDuration);
          this.finalPricing.duration = actualDuration;
        }
      }
      
      // Show payment modal after rating
      this.showPaymentModal = true;
      this.showToast('Thank you for your rating!', 'success');
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error submitting rating:', error);
      this.showToast('Error submitting rating', 'danger');
    }
  }

  /**
   * Set client rating
   */
  setRating(rating: number) {
    this.clientRating = rating;
  }

  /**
   * Start periodic timer check to ensure timer starts even with race conditions
   */
  private startPeriodicTimerCheck() {
    // Check every 3 seconds if timer should be running but isn't
    const timerCheck = setInterval(() => {
      if (this.bookingData?.status === 'in-progress' && 
          this.bookingData?.jobTimer?.startTime && 
          !this.jobTimer) {
        console.log('🔄 Periodic check: Timer should be running but isn\'t. Starting now...');
        this.startJobTimer();
      }
      
      // Stop checking after 30 seconds to avoid infinite checks
      setTimeout(() => {
        clearInterval(timerCheck);
      }, 30000);
    }, 3000);
  }


  /**
   * Fetch client/service location address from Nominatim
   */
  async fetchClientLocationAddress(lat: number, lng: number): Promise<void> {
    if (lat === 0 && lng === 0) {
      this.clientLocationAddress = 'Location not available';
      return;
    }

    this.isLoadingClientAddress = true;
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'HandyHome/1.0'
        }
      });
      const data = await response.json();

      if (data && data.display_name) {
        this.clientLocationAddress = data.display_name;
      } else {
        this.clientLocationAddress = 'Address not available';
      }
    } catch (error) {
      console.error('Error fetching client location address:', error);
      this.clientLocationAddress = 'Unable to fetch address';
    } finally {
      this.isLoadingClientAddress = false;
    }
  }
}
