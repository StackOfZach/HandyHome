import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Firestore,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  Timestamp,
  serverTimestamp,
} from '@angular/fire/firestore';
import {
  ToastController,
  AlertController,
  ModalController,
} from '@ionic/angular';
import { AuthService, UserProfile } from '../../../services/auth.service';
import {
  DashboardService,
  ServiceCategory,
} from '../../../services/dashboard.service';
import { WorkerService } from '../../../services/worker.service';
import { Subscription, interval } from 'rxjs';
import { Geolocation } from '@capacitor/geolocation';
import { BookingData } from '../../../services/booking.service';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from '@angular/fire/firestore';

interface SubServicePrice {
  subServiceName: string;
  price: number;
  unit?: string;
}

interface ServiceWithPricing {
  categoryName: string;
  subServices: SubServicePrice[];
}

interface WorkerServicePricing {
  serviceName: string;
  subServiceName: string;
  price: number;
  unit: string;
}

@Component({
  selector: 'app-booking-details',
  templateUrl: './booking-details.page.html',
  styleUrls: ['./booking-details.page.scss'],
  standalone: false,
})
export class BookingDetailsPage implements OnInit, OnDestroy {
  bookingId: string = '';
  booking: any = null; // Using any for now since it handles both BookingData and QuickBookingData
  userProfile: UserProfile | null = null;
  isLoading: boolean = true;
  jobAmount: number = 0;
  isLocationTracking: boolean = false;
  workerLocation: { lat: number; lng: number } | null = null;
  isWithinRadius: boolean = false;

  // Job control states
  isJobStarted: boolean = false;
  isJobCompleted: boolean = false;
  isPaymentRequested: boolean = false;

  // New workflow states
  hasArrivedAtClient: boolean = false;
  showArrivalSlider: boolean = false;
  showStartJobButton: boolean = false;
  showJobDoneSlider: boolean = false;

  // Slider states for iPhone-style sliding
  arrivalSlideProgress: number = 0;
  arrivalSliderPosition: number = 8; // Initial left position (8px padding)
  completeSlideProgress: number = 0;
  completeSliderPosition: number = 8;
  private isDraggingArrival: boolean = false;
  private isDraggingComplete: boolean = false;
  private startX: number = 0;
  private startSliderPosition: number = 0;
  private sliderWidth: number = 0;

  // Job timer
  jobStartTime: Date | null = null;
  jobEndTime: Date | null = null;
  jobDuration: number = 0; // in milliseconds
  jobTimer: string = '00:00:00';
  private timerSubscription?: Subscription;

  // Photo capture
  completionPhoto: string = '';
  isCapturingPhoto: boolean = false;

  // Worker pricing
  workerPricing: WorkerServicePricing | null = null;
  serviceCategories: ServiceCategory[] = [];
  loadingPricing: boolean = false;

  private subscriptions: Subscription[] = [];
  private locationSubscription?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private firestore: Firestore,
    private toastController: ToastController,
    private alertController: AlertController,
    private modalController: ModalController,
    private authService: AuthService,
    private dashboardService: DashboardService,
    private workerService: WorkerService
  ) {}

  ngOnInit() {
    // Get booking ID from route params (not query params)
    this.route.params.subscribe((params) => {
      this.bookingId = params['id'];
      if (this.bookingId) {
        this.loadBookingDetails();
      }
    });

    // Get user profile
    this.subscriptions.push(
      this.authService.userProfile$.subscribe((profile) => {
        this.userProfile = profile;
      })
    );
  }

  async loadBookingDetails() {
    if (!this.bookingId) return;

    try {
      const bookingRef = doc(this.firestore, 'bookings', this.bookingId);

      // Set up real-time listener
      const unsubscribe = onSnapshot(
        bookingRef,
        (doc) => {
          if (doc.exists()) {
            this.booking = {
              id: doc.id,
              ...doc.data(),
            };
            console.log('Booking loaded:', this.booking);
            console.log('Booking address:', this.booking.address);
            console.log('Booking coordinates:', this.booking.coordinates);
            console.log('Booking location (legacy):', this.booking.location);
            console.log('Booking locations (legacy):', this.booking.locations);
            console.log('Booking neededService:', this.booking.neededService);
            console.log(
              'Booking specificService:',
              this.booking.specificService
            );

            // Load worker pricing after booking is loaded
            this.loadWorkerPricing();

            // Update workflow state based on booking status
            this.updateWorkflowState();
          } else {
            console.log('Booking not found in bookings collection');
            this.showToast('Booking not found', 'danger');
            this.router.navigate(['/pages/worker/dashboard']);
          }
          this.isLoading = false;
        },
        (error) => {
          console.error('Error listening to booking:', error);
          this.showToast('Error loading booking details', 'danger');
          this.isLoading = false;
        }
      );

      this.subscriptions.push({ unsubscribe } as any);
    } catch (error) {
      console.error('Error loading booking details:', error);
      this.showToast('Error loading booking details', 'danger');
      this.isLoading = false;
    }
  }

  async updateBookingStatus(status: string) {
    try {
      const bookingRef = doc(this.firestore, 'bookings', this.bookingId);
      const updateData: any = {
        status: status,
        updatedAt: Timestamp.now(),
      };

      // Add timestamp for specific status changes
      if (status === 'on-the-way') {
        updateData.onTheWayAt = Timestamp.now();
      } else if (status === 'service-started') {
        updateData.serviceStartedAt = Timestamp.now();
      } else if (status === 'completed') {
        updateData.completedAt = Timestamp.now();
      }

      await updateDoc(bookingRef, updateData);

      this.showToast(`Booking status updated to ${status}`, 'success');

      // Start location tracking when going on the way
      if (status === 'on-the-way' && !this.isLocationTracking) {
        await this.startLocationTracking();
      }
    } catch (error) {
      console.error('Error updating booking status:', error);
      this.showToast('Error updating booking status', 'danger');
    }
  }

  openDirections() {
    console.log('Booking data for directions:', this.booking);
    let lat, lng;

    // Handle enhanced location structure (primary)
    if (this.booking?.coordinates) {
      lat = this.booking.coordinates.lat;
      lng = this.booking.coordinates.lng;
      console.log('Using coordinates from booking.coordinates:', lat, lng);
    }
    // Handle legacy location format (fallback)
    else if (this.booking?.location) {
      ({ lat, lng } = this.booking.location);
      console.log('Using coordinates from booking.location:', lat, lng);
    }
    // Handle locations array format (fallback)
    else if (this.booking?.locations && this.booking.locations.length > 0) {
      const location = this.booking.locations[0];
      if (location.coordinates) {
        lat = location.coordinates.latitude;
        lng = location.coordinates.longitude;
        console.log(
          'Using coordinates from booking.locations[0].coordinates:',
          lat,
          lng
        );
      }
    }

    if (!lat || !lng) {
      console.log('No valid coordinates found');
      this.showToast('Location not available', 'danger');
      return;
    }

    console.log('Opening directions to:', lat, lng);
    // Open Google Maps with directions
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(directionsUrl, '_system');
  }

  async confirmOnTheWay() {
    const alert = await this.alertController.create({
      header: 'Confirm',
      message: 'Are you on your way to the client?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Yes, On My Way',
          handler: () => {
            this.updateBookingStatus('on-the-way');
          },
        },
      ],
    });

    await alert.present();
  }

  async confirmArrived() {
    const alert = await this.alertController.create({
      header: 'Confirm',
      message: 'Have you arrived at the client location?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: "Yes, I've Arrived",
          handler: () => {
            this.updateBookingStatus('in-progress');
          },
        },
      ],
    });

    await alert.present();
  }

  async confirmCompleted() {
    const alert = await this.alertController.create({
      header: 'Confirm',
      message: 'Have you completed the service?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Yes, Completed',
          handler: () => {
            this.completeJob(); // Use the enhanced complete job method
          },
        },
      ],
    });

    await alert.present();
  }

  // Enhanced workflow methods
  async confirmGoingOnTheWay() {
    const alert = await this.alertController.create({
      header: 'Going to Client',
      message:
        'Are you ready to head to the client location? This will start location tracking.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Yes, On My Way',
          handler: async () => {
            await this.updateBookingStatus('on-the-way');
            this.showToast(
              'Status updated! Location tracking started.',
              'success'
            );
          },
        },
      ],
    });

    await alert.present();
  }

  // Check if it's the scheduled date for the job
  isScheduledDate(): boolean {
    if (!this.booking?.scheduleDate) {
      console.log('No schedule date found in booking:', this.booking);
      return false;
    }

    const today = new Date();
    let scheduleDate: Date;

    // Handle different date formats
    if (this.booking.scheduleDate instanceof Date) {
      scheduleDate = this.booking.scheduleDate;
    } else if (typeof this.booking.scheduleDate === 'string') {
      scheduleDate = new Date(this.booking.scheduleDate);
    } else if (this.booking.scheduleDate.toDate) {
      // Firestore Timestamp
      scheduleDate = this.booking.scheduleDate.toDate();
    } else {
      console.log('Unknown schedule date format:', this.booking.scheduleDate);
      return false;
    }

    // Normalize dates to compare only year, month, and day
    const todayNormalized = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const scheduleDateNormalized = new Date(
      scheduleDate.getFullYear(),
      scheduleDate.getMonth(),
      scheduleDate.getDate()
    );

    console.log('Date comparison:', {
      today: todayNormalized,
      scheduleDate: scheduleDateNormalized,
      isToday: todayNormalized.getTime() === scheduleDateNormalized.getTime(),
      bookingStatus: this.booking.status,
    });

    return todayNormalized.getTime() === scheduleDateNormalized.getTime();
  }

  // Format the scheduled date for display
  getFormattedScheduleDate(): string {
    if (!this.booking?.scheduleDate) return 'Not scheduled';

    let scheduleDate: Date;

    try {
      // Handle different date formats
      if (this.booking.scheduleDate instanceof Date) {
        scheduleDate = this.booking.scheduleDate;
      } else if (typeof this.booking.scheduleDate === 'string') {
        scheduleDate = new Date(this.booking.scheduleDate);
      } else if (this.booking.scheduleDate.toDate) {
        // Firestore Timestamp
        scheduleDate = this.booking.scheduleDate.toDate();
      } else {
        return 'Invalid date format';
      }

      return scheduleDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (error) {
      console.error('Error formatting schedule date:', error);
      return 'Date formatting error';
    }
  }

  // Get appropriate button text based on current status and conditions
  getActionButtonText(): string {
    if (!this.booking?.status) return '';

    switch (this.booking.status) {
      case 'accepted':
        if (!this.isScheduledDate()) return 'Not scheduled for today';
        return 'Go to Client';
      case 'on-the-way':
        return 'Heading to location...';
      case 'service-started':
        return 'Complete Job';
      case 'awaiting-payment':
        return 'Confirm Payment Received';
      case 'completed':
        return 'Job Finished';
      default:
        return '';
    }
  }

  async showToast(message: string, color: 'success' | 'danger' | 'medium') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  goBack() {
    this.router.navigate(['/pages/worker/dashboard']);
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'accepted':
        return 'checkmark-circle';
      case 'on-the-way':
        return 'car';
      case 'in-progress':
        return 'build';
      case 'completed':
        return 'trophy';
      default:
        return 'help-circle';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'accepted':
        return 'Booking Accepted';
      case 'on-the-way':
        return 'On The Way';
      case 'service-started':
        return 'Service Started';
      case 'awaiting-payment':
        return 'Awaiting Payment';
      case 'completed':
        return 'Service Completed';
      default:
        return 'Unknown Status';
    }
  }

  getStatusDisplay(): string {
    if (!this.booking?.status) return 'UNKNOWN';

    switch (this.booking.status) {
      case 'pending':
        return 'PENDING';
      case 'accepted':
        return 'ACCEPTED';
      case 'on-the-way':
        return 'ON THE WAY';
      case 'service-started':
        return 'SERVICE STARTED';
      case 'awaiting-payment':
        return 'AWAITING PAYMENT';
      case 'completed':
        return 'COMPLETED';
      default:
        return 'UNKNOWN';
    }
  }

  // SMS Messaging Feature
  async sendClientMessage() {
    if (!this.userProfile?.fullName || !this.booking) {
      this.showToast('Unable to send message', 'danger');
      return;
    }

    const scheduleDate =
      this.booking.scheduleDate || this.booking.date || new Date();
    const formattedDate = new Date(scheduleDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const message = `Hi! I am ${this.userProfile.fullName}, your HandyHome worker. I have accepted your job and will see you on ${formattedDate}. Thank you for choosing HandyHome!`;

    // Get client phone number
    const clientPhone =
      this.booking.clientPhone || this.booking.customerPhone || '';

    if (!clientPhone) {
      this.showToast('Client phone number not available', 'medium');
      return;
    }

    // Open SMS app with pre-filled message
    const smsUrl = `sms:${clientPhone}?body=${encodeURIComponent(message)}`;
    window.open(smsUrl, '_system');
  }

  // Location Tracking
  async startLocationTracking() {
    if (this.isLocationTracking) return;

    try {
      // Request permission first
      const permission = await Geolocation.requestPermissions();
      if (permission.location !== 'granted') {
        this.showToast('Location permission required for tracking', 'medium');
        return;
      }

      this.isLocationTracking = true;

      // Update location every 10 seconds
      this.locationSubscription = interval(10000).subscribe(async () => {
        await this.updateWorkerLocation();
      });

      // Initial location update
      await this.updateWorkerLocation();

      this.showToast('Location tracking started', 'success');
    } catch (error) {
      console.error('Error starting location tracking:', error);
      this.showToast('Error starting location tracking', 'danger');
    }
  }

  async updateWorkerLocation() {
    try {
      const position = await Geolocation.getCurrentPosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      this.workerLocation = { lat, lng };

      // Update Firestore with worker location
      if (this.bookingId) {
        await updateDoc(doc(this.firestore, 'bookings', this.bookingId), {
          workerLocation: {
            latitude: lat,
            longitude: lng,
            timestamp: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        });
      }

      // Check proximity to client
      this.checkProximity();
    } catch (error) {
      console.error('Error updating location:', error);
    }
  }

  checkProximity() {
    if (!this.workerLocation || !this.booking) return;

    let clientLat, clientLng;

    // Get client location - handle enhanced location structure (primary)
    if (this.booking.coordinates) {
      clientLat = this.booking.coordinates.lat;
      clientLng = this.booking.coordinates.lng;
      console.log(
        'Using client location from booking.coordinates:',
        clientLat,
        clientLng
      );
    }
    // Handle legacy location format (fallback)
    else if (this.booking.location) {
      clientLat = this.booking.location.lat;
      clientLng = this.booking.location.lng;
      console.log(
        'Using client location from booking.location:',
        clientLat,
        clientLng
      );
    }
    // Handle locations array format (fallback)
    else if (this.booking.locations && this.booking.locations.length > 0) {
      const location = this.booking.locations[0];
      if (location.coordinates) {
        clientLat = location.coordinates.latitude;
        clientLng = location.coordinates.longitude;
        console.log(
          'Using client location from booking.locations[0].coordinates:',
          clientLat,
          clientLng
        );
      }
    }

    if (!clientLat || !clientLng) {
      console.log('No valid client coordinates found for proximity check');
      return;
    }

    // Calculate distance using Haversine formula
    const distance = this.calculateDistance(
      this.workerLocation.lat,
      this.workerLocation.lng,
      clientLat,
      clientLng
    );

    // Check if within 100m radius
    const wasWithinRadius = this.isWithinRadius;
    this.isWithinRadius = distance <= 0.1; // 0.1 km = 100m

    // If just arrived within radius and worker is on the way, automatically start service
    if (
      this.isWithinRadius &&
      !wasWithinRadius &&
      this.booking.status === 'on-the-way'
    ) {
      this.updateBookingStatus('service-started');
      this.showToast(
        'You have arrived! Service automatically started.',
        'success'
      );
    }
  }

  calculateDistance(
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

  toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // Old job control methods removed - using comprehensive workflow methods

  async requestPayment(amount: number) {
    try {
      await updateDoc(doc(this.firestore, 'bookings', this.bookingId), {
        finalAmount: amount,
        paymentStatus: 'requested',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      this.isPaymentRequested = true;
      this.showToast('Payment request sent to client', 'success');
    } catch (error) {
      console.error('Error requesting payment:', error);
      this.showToast('Error requesting payment', 'danger');
    }
  }

  async confirmPaymentReceived() {
    const alert = await this.alertController.create({
      header: 'Confirm Payment',
      message: 'Have you received the payment from the client?',
      buttons: [
        { text: 'Not Yet', role: 'cancel' },
        {
          text: 'Yes, Received',
          handler: async () => {
            await updateDoc(doc(this.firestore, 'bookings', this.bookingId), {
              status: 'completed',
              paymentStatus: 'completed',
              paymentConfirmedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            this.showToast(
              'Payment confirmed! Job completed successfully.',
              'success'
            );
            this.router.navigate(['/pages/worker/dashboard']);
          },
        },
      ],
    });
    await alert.present();
  }

  // Google Maps Directions Feature
  async openGoogleMapsDirections() {
    if (!this.booking?.coordinates) {
      this.showToast('Client location is not available', 'medium');
      return;
    }

    try {
      // Get current location
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      });

      const workerLat = coordinates.coords.latitude;
      const workerLng = coordinates.coords.longitude;
      const clientLat = this.booking.coordinates.lat;
      const clientLng = this.booking.coordinates.lng;

      // Create Google Maps directions URL
      const mapsUrl = `https://www.google.com/maps/dir/${workerLat},${workerLng}/${clientLat},${clientLng}`;

      // Open Google Maps in a new window/tab
      window.open(mapsUrl, '_blank');

      this.showToast('Opening Google Maps for directions...', 'success');
    } catch (error) {
      console.error('Error opening Google Maps directions:', error);

      // Fallback: Open maps with just destination
      const clientLat = this.booking.coordinates.lat;
      const clientLng = this.booking.coordinates.lng;
      const fallbackUrl = `https://www.google.com/maps?q=${clientLat},${clientLng}`;

      window.open(fallbackUrl, '_blank');
      this.showToast('Opened client location in Google Maps', 'success');
    }
  }

  stopLocationTracking() {
    if (this.locationSubscription) {
      this.locationSubscription.unsubscribe();
      this.locationSubscription = undefined;
    }
    this.isLocationTracking = false;
  }

  // ===== PRICING METHODS =====

  async loadServiceCategories() {
    try {
      this.serviceCategories =
        await this.dashboardService.getServiceCategories();
      console.log('Service categories loaded:', this.serviceCategories);
    } catch (error) {
      console.error('Error loading service categories:', error);
      this.serviceCategories = [];
    }
  }

  async loadWorkerPricing() {
    if (!this.booking || !this.userProfile?.uid) return;

    try {
      this.loadingPricing = true;

      // Load service categories first
      await this.loadServiceCategories();

      // Get the main service and specific service from booking
      const mainService = this.booking.neededService;
      const specificService = this.booking.specificService;

      console.log('Loading worker pricing for:', {
        mainService,
        specificService,
      });

      // Fetch worker profile to get pricing data
      const workerProfile = await this.workerService.getCompleteWorkerProfile(
        this.userProfile.uid
      );

      if (workerProfile) {
        console.log('Worker profile loaded:', workerProfile);
        const serviceWithPricing = (workerProfile as any)
          .serviceWithPricing as ServiceWithPricing[];
        console.log('Worker serviceWithPricing:', serviceWithPricing);

        if (serviceWithPricing && serviceWithPricing.length > 0) {
          await this.findPricingInData(
            serviceWithPricing,
            mainService,
            specificService
          );
        }
      }

      // If no pricing found, try direct fetch from workers collection
      if (!this.workerPricing) {
        console.log(
          'No worker pricing found in profile, trying direct fetch...'
        );
        await this.fetchWorkerPricingDirectly(mainService, specificService);
      }

      // If still no pricing found, create mock pricing
      if (!this.workerPricing) {
        console.log('No worker pricing found, creating mock data');
        const unit = await this.getServiceUnit(
          mainService,
          specificService || mainService
        );

        this.workerPricing = {
          serviceName: mainService,
          subServiceName: specificService || mainService,
          price: 500, // Mock price
          unit: this.formatUnit(unit),
        };
      }

      console.log('Final worker pricing:', this.workerPricing);
    } catch (error) {
      console.error('Error loading worker pricing:', error);
    } finally {
      this.loadingPricing = false;
    }
  }

  async fetchWorkerPricingDirectly(
    mainService: string,
    specificService?: string
  ): Promise<void> {
    try {
      console.log(
        'Fetching worker pricing directly from workers collection...'
      );

      const workerDoc = await getDocs(
        query(
          collection(this.firestore, 'workers'),
          where('__name__', '==', this.userProfile!.uid),
          limit(1)
        )
      );

      if (!workerDoc.empty) {
        const workerData = workerDoc.docs[0].data();
        console.log('Direct worker data:', workerData);

        const serviceWithPricing = workerData[
          'serviceWithPricing'
        ] as ServiceWithPricing[];

        if (serviceWithPricing && serviceWithPricing.length > 0) {
          await this.findPricingInData(
            serviceWithPricing,
            mainService,
            specificService
          );
        }
      }
    } catch (error) {
      console.error('Error fetching worker pricing directly:', error);
    }
  }

  async findPricingInData(
    serviceWithPricing: ServiceWithPricing[],
    mainService: string,
    specificService?: string
  ): Promise<void> {
    let foundPricing: SubServicePrice | null = null;
    let matchedCategory: ServiceWithPricing | null = null;

    console.log(
      'Searching for pricing - Available categories:',
      serviceWithPricing.map((c) => c.categoryName)
    );

    // Find matching category
    matchedCategory =
      serviceWithPricing.find((category: ServiceWithPricing) => {
        const categoryLower = category.categoryName.toLowerCase();
        const serviceLower = mainService.toLowerCase();

        console.log(
          `Comparing category "${categoryLower}" with service "${serviceLower}"`
        );

        return (
          categoryLower === serviceLower ||
          categoryLower.includes(serviceLower) ||
          serviceLower.includes(categoryLower) ||
          this.isServiceMatch(categoryLower, serviceLower)
        );
      }) || null;

    if (matchedCategory) {
      console.log('Found matching category:', matchedCategory);
      console.log(
        'Available sub-services:',
        matchedCategory.subServices.map((s) => s.subServiceName)
      );

      // Look for specific service
      if (specificService) {
        console.log('Looking for specific service:', specificService);
        foundPricing =
          matchedCategory.subServices.find((subService: SubServicePrice) => {
            const subServiceLower = subService.subServiceName.toLowerCase();
            const specificLower = specificService.toLowerCase();

            console.log(
              `Comparing sub-service "${subServiceLower}" with specific "${specificLower}"`
            );

            return (
              subServiceLower === specificLower ||
              subServiceLower.includes(specificLower) ||
              specificLower.includes(subServiceLower) ||
              this.isServiceMatch(subServiceLower, specificLower)
            );
          }) || null;
      }

      // Use first subservice if no specific match
      if (!foundPricing && matchedCategory.subServices.length > 0) {
        foundPricing = matchedCategory.subServices[0];
        console.log('Using first available sub-service:', foundPricing);
      }

      if (foundPricing) {
        const unit =
          foundPricing.unit ||
          (await this.getServiceUnit(
            matchedCategory.categoryName,
            foundPricing.subServiceName
          ));

        this.workerPricing = {
          serviceName: matchedCategory.categoryName,
          subServiceName: foundPricing.subServiceName,
          price: foundPricing.price,
          unit: this.formatUnit(unit || 'per_hour'),
        };

        console.log('Found pricing:', this.workerPricing);
      }
    } else {
      console.log('No matching category found for:', mainService);
    }
  }

  async getServiceUnit(
    serviceName: string,
    subServiceName: string
  ): Promise<string> {
    try {
      const serviceCategory = this.serviceCategories.find(
        (cat) =>
          cat.name.toLowerCase() === serviceName.toLowerCase() ||
          cat.services.some(
            (service) => service.toLowerCase() === serviceName.toLowerCase()
          )
      );

      if (
        serviceCategory &&
        serviceCategory.services &&
        serviceCategory.servicesQuickBookingUnit
      ) {
        const subServiceIndex = serviceCategory.services.findIndex(
          (service) => service.toLowerCase() === subServiceName.toLowerCase()
        );

        if (
          subServiceIndex >= 0 &&
          serviceCategory.servicesQuickBookingUnit[subServiceIndex]
        ) {
          return serviceCategory.servicesQuickBookingUnit[subServiceIndex];
        }
      }

      return 'per_hour';
    } catch (error) {
      console.error('Error getting service unit:', error);
      return 'per_hour';
    }
  }

  isServiceMatch(service1: string, service2: string): boolean {
    const commonWords = [
      'service',
      'services',
      'work',
      'repair',
      'maintenance',
    ];

    const clean1 = service1
      .replace(new RegExp(commonWords.join('|'), 'gi'), '')
      .trim();
    const clean2 = service2
      .replace(new RegExp(commonWords.join('|'), 'gi'), '')
      .trim();

    return clean1.includes(clean2) || clean2.includes(clean1);
  }

  formatUnit(unit: string): string {
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

    return `₱${this.workerPricing.price.toLocaleString()} ${
      this.workerPricing.unit
    }`;
  }

  hasWorkerPricing(): boolean {
    return this.workerPricing !== null;
  }

  // ===== COMPREHENSIVE BOOKING WORKFLOW METHODS =====

  // Step 1: Go to Client (triggers arrival slider)
  async goToClient() {
    try {
      await this.updateBookingStatus('on-the-way');
      this.showArrivalSlider = true;
      this.showToast(
        'Navigate to client location. Slide when you arrive!',
        'medium'
      );
    } catch (error) {
      console.error('Error going to client:', error);
      this.showToast('Error updating status', 'danger');
    }
  }

  // Step 2: Confirm Arrival ("I'm here" slider)
  async confirmArrival() {
    try {
      const bookingRef = doc(this.firestore, 'bookings', this.bookingId);
      await updateDoc(bookingRef, {
        status: 'worker-arrived',
        workerArrivedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      this.hasArrivedAtClient = true;
      this.showArrivalSlider = false;
      this.showStartJobButton = true;

      this.showToast('Arrival confirmed! Client has been notified.', 'success');
    } catch (error) {
      console.error('Error confirming arrival:', error);
      this.showToast('Error confirming arrival', 'danger');
    }
  }

  // Step 3: Start Job
  async startJob() {
    try {
      this.jobStartTime = new Date();

      const bookingRef = doc(this.firestore, 'bookings', this.bookingId);
      await updateDoc(bookingRef, {
        status: 'service-started',
        serviceStartedAt: Timestamp.now(),
        jobStartTime: Timestamp.fromDate(this.jobStartTime),
        updatedAt: Timestamp.now(),
      });

      this.isJobStarted = true;
      this.showStartJobButton = false;
      this.showJobDoneSlider = true;

      // Start the job timer
      this.startJobTimer();

      this.showToast('Job started! Timer is now running.', 'success');
    } catch (error) {
      console.error('Error starting job:', error);
      this.showToast('Error starting job', 'danger');
    }
  }

  // Step 4: Job Timer
  startJobTimer() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }

    this.timerSubscription = interval(1000).subscribe(() => {
      if (this.jobStartTime) {
        const now = new Date();
        const diff = now.getTime() - this.jobStartTime.getTime();
        this.jobDuration = diff;
        this.jobTimer = this.formatDuration(diff);
      }
    });
  }

  stopJobTimer() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = undefined;
    }
  }

  formatDuration(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Step 5: Complete Job ("Job Done" slider)
  async completeJob() {
    try {
      this.jobEndTime = new Date();
      this.stopJobTimer();

      // Show photo capture modal
      await this.showPhotoCapture();
    } catch (error) {
      console.error('Error completing job:', error);
      this.showToast('Error completing job', 'danger');
    }
  }

  // Step 6: Photo Capture Modal
  async showPhotoCapture() {
    const alert = await this.alertController.create({
      header: 'Job Completed',
      message: 'Please take a photo of the completed work to show the client.',
      buttons: [
        {
          text: 'Take Photo',
          handler: async () => {
            await this.captureCompletionPhoto();
          },
        },
      ],
      backdropDismiss: false,
    });

    await alert.present();
  }

  async captureCompletionPhoto() {
    try {
      this.isCapturingPhoto = true;

      const image = await Camera.getPhoto({
        quality: 60,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      if (image.dataUrl) {
        // Compress the image to reduce file size
        const compressedPhoto = await this.compressImage(image.dataUrl);
        this.completionPhoto = compressedPhoto;
        await this.submitJobCompletion();
      }
    } catch (error) {
      console.error('Error capturing photo:', error);
      this.showToast('Error taking photo. Please try again.', 'danger');
    } finally {
      this.isCapturingPhoto = false;
    }
  }

  // Image compression helper to reduce file size for Firestore
  async compressImage(dataUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;

        let width = img.width;
        let height = img.height;

        // Calculate new dimensions while maintaining aspect ratio
        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        // Create canvas and compress
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to compressed data URL with JPEG format and quality 0.7
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);

        console.log(
          `Original size: ${dataUrl.length} bytes, Compressed size: ${compressedDataUrl.length} bytes`
        );
        resolve(compressedDataUrl);
      };

      img.onerror = () => {
        reject(new Error('Error loading image'));
      };

      img.src = dataUrl;
    });
  }

  // Step 7: Submit Job Completion
  async submitJobCompletion() {
    try {
      const calculatedPayment = this.calculatePayment();

      const bookingRef = doc(this.firestore, 'bookings', this.bookingId);
      await updateDoc(bookingRef, {
        status: 'awaiting-payment',
        completedAt: Timestamp.now(),
        jobEndTime: this.jobEndTime
          ? Timestamp.fromDate(this.jobEndTime)
          : Timestamp.now(),
        jobDuration: this.jobDuration,
        completionPhoto: this.completionPhoto,
        calculatedPayment: calculatedPayment,
        updatedAt: Timestamp.now(),
      });

      this.isJobCompleted = true;
      this.showJobDoneSlider = false;
      this.isPaymentRequested = true;

      this.showToast(
        'Job completed! Client will review and provide payment.',
        'success'
      );
    } catch (error) {
      console.error('Error submitting job completion:', error);
      this.showToast('Error submitting completion', 'danger');
    }
  }

  // Step 8: Calculate Payment
  calculatePayment() {
    if (!this.workerPricing || !this.jobDuration) {
      return {
        baseAmount: 0,
        totalHours: 0,
        serviceFee: 0,
        transportationFee: 0,
        totalAmount: 0,
      };
    }

    const durationInHours = this.jobDuration / (1000 * 60 * 60); // Convert ms to hours
    let billingHours: number;

    // Fair billing calculation
    if (durationInHours < 1) {
      billingHours = 1; // Minimum 1 hour
    } else {
      // Round up to next hour if more than 3 minutes past the hour
      const wholeHours = Math.floor(durationInHours);
      const extraMinutes = (durationInHours - wholeHours) * 60;
      billingHours = extraMinutes > 3 ? wholeHours + 1 : wholeHours;
    }

    const baseAmount = this.workerPricing.price * billingHours;
    const serviceFee = baseAmount * 0.1; // 10% service fee
    const transportationFee = 50; // Fixed ₱50 transportation fee
    const totalAmount = baseAmount + serviceFee + transportationFee;

    return {
      baseAmount,
      totalHours: billingHours,
      hourlyRate: this.workerPricing.price,
      serviceFee,
      transportationFee,
      totalAmount,
      actualDuration: this.formatDuration(this.jobDuration),
      billingDuration: `${billingHours} hour${billingHours !== 1 ? 's' : ''}`,
    };
  }

  // Update booking status based on current workflow state
  updateWorkflowState() {
    if (!this.booking) return;

    const status = this.booking.status;

    // Set UI states based on booking status
    switch (status) {
      case 'accepted':
        this.showArrivalSlider = false;
        this.showStartJobButton = false;
        this.showJobDoneSlider = false;
        break;

      case 'on-the-way':
        this.showArrivalSlider = true;
        this.showStartJobButton = false;
        this.showJobDoneSlider = false;
        break;

      case 'worker-arrived':
        this.hasArrivedAtClient = true;
        this.showArrivalSlider = false;
        this.showStartJobButton = true;
        this.showJobDoneSlider = false;
        break;

      case 'service-started':
        this.hasArrivedAtClient = true;
        this.isJobStarted = true;
        this.showArrivalSlider = false;
        this.showStartJobButton = false;
        this.showJobDoneSlider = true;

        // Restore job timer if job was already started
        if (this.booking.jobStartTime && !this.timerSubscription) {
          this.jobStartTime = this.booking.jobStartTime.toDate();
          this.startJobTimer();
        }
        break;

      case 'awaiting-payment':
      case 'completed':
        this.hasArrivedAtClient = true;
        this.isJobStarted = true;
        this.isJobCompleted = true;
        this.showArrivalSlider = false;
        this.showStartJobButton = false;
        this.showJobDoneSlider = false;

        if (this.booking.jobEndTime) {
          this.jobEndTime = this.booking.jobEndTime.toDate();
          this.jobDuration = this.booking.jobDuration || 0;
          this.jobTimer = this.formatDuration(this.jobDuration);
        }
        break;
    }
  }

  ngOnDestroy() {
    // Clean up subscriptions
    this.subscriptions.forEach((sub) => {
      if (sub && typeof sub.unsubscribe === 'function') {
        sub.unsubscribe();
      }
    });

    if (this.locationSubscription) {
      this.locationSubscription.unsubscribe();
    }

    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }

    this.stopLocationTracking();
  }

  // iPhone-style sliding methods
  startArrivalSlide(event: MouseEvent | TouchEvent) {
    event.preventDefault();
    this.isDraggingArrival = true;
    this.isDraggingComplete = false;
    
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    this.startX = clientX;
    this.startSliderPosition = this.arrivalSliderPosition;
    
    // Get slider track width
    const trackElement = event.target as HTMLElement;
    const sliderTrack = trackElement.closest('.h-16') as HTMLElement;
    if (sliderTrack) {
      this.sliderWidth = sliderTrack.offsetWidth - 64; // Subtract button width (48px) + padding (16px)
    }
    
    // Add event listeners
    document.addEventListener('mousemove', this.onArrivalSlideMove);
    document.addEventListener('mouseup', this.onArrivalSlideEnd);
    document.addEventListener('touchmove', this.onArrivalSlideMove, { passive: false });
    document.addEventListener('touchend', this.onArrivalSlideEnd);
  }

  onArrivalSlideMove = (event: MouseEvent | TouchEvent) => {
    if (!this.isDraggingArrival) return;
    
    event.preventDefault();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const deltaX = clientX - this.startX;
    let newPosition = this.startSliderPosition + deltaX;
    
    // Constrain position
    newPosition = Math.max(8, Math.min(this.sliderWidth, newPosition));
    
    this.arrivalSliderPosition = newPosition;
    this.arrivalSlideProgress = Math.max(0, Math.min(1, (newPosition - 8) / (this.sliderWidth - 8)));
  }

  onArrivalSlideEnd = () => {
    if (!this.isDraggingArrival) return;
    
    this.isDraggingArrival = false;
    
    // Remove event listeners
    document.removeEventListener('mousemove', this.onArrivalSlideMove);
    document.removeEventListener('mouseup', this.onArrivalSlideEnd);
    document.removeEventListener('touchmove', this.onArrivalSlideMove);
    document.removeEventListener('touchend', this.onArrivalSlideEnd);
    
    // Check if slider was completed (85% or more)
    if (this.arrivalSlideProgress >= 0.85) {
      this.confirmArrival();
    } else {
      // Reset slider if not completed
      this.resetArrivalSlider();
    }
  }

  resetArrivalSlider() {
    this.arrivalSliderPosition = 8;
    this.arrivalSlideProgress = 0;
  }

  startCompleteSlide(event: MouseEvent | TouchEvent) {
    event.preventDefault();
    this.isDraggingComplete = true;
    this.isDraggingArrival = false;
    
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    this.startX = clientX;
    this.startSliderPosition = this.completeSliderPosition;
    
    // Get slider track width
    const trackElement = event.target as HTMLElement;
    const sliderTrack = trackElement.closest('.h-16') as HTMLElement;
    if (sliderTrack) {
      this.sliderWidth = sliderTrack.offsetWidth - 64; // Subtract button width (48px) + padding (16px)
    }
    
    // Add event listeners
    document.addEventListener('mousemove', this.onCompleteSlideMove);
    document.addEventListener('mouseup', this.onCompleteSlideEnd);
    document.addEventListener('touchmove', this.onCompleteSlideMove, { passive: false });
    document.addEventListener('touchend', this.onCompleteSlideEnd);
  }

  onCompleteSlideMove = (event: MouseEvent | TouchEvent) => {
    if (!this.isDraggingComplete) return;
    
    event.preventDefault();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const deltaX = clientX - this.startX;
    let newPosition = this.startSliderPosition + deltaX;
    
    // Constrain position
    newPosition = Math.max(8, Math.min(this.sliderWidth, newPosition));
    
    this.completeSliderPosition = newPosition;
    this.completeSlideProgress = Math.max(0, Math.min(1, (newPosition - 8) / (this.sliderWidth - 8)));
  }

  onCompleteSlideEnd = () => {
    if (!this.isDraggingComplete) return;
    
    this.isDraggingComplete = false;
    
    // Remove event listeners
    document.removeEventListener('mousemove', this.onCompleteSlideMove);
    document.removeEventListener('mouseup', this.onCompleteSlideEnd);
    document.removeEventListener('touchmove', this.onCompleteSlideMove);
    document.removeEventListener('touchend', this.onCompleteSlideEnd);
    
    // Check if slider was completed (85% or more)
    if (this.completeSlideProgress >= 0.85) {
      this.completeJob();
    } else {
      // Reset slider if not completed
      this.resetCompleteSlider();
    }
  }

  resetCompleteSlider() {
    this.completeSliderPosition = 8;
    this.completeSlideProgress = 0;
  }
}
