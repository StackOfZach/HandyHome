import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Firestore,
  doc,
  getDoc,
  onSnapshot,
  Unsubscribe,
} from '@angular/fire/firestore';
import {
  ToastController,
  AlertController,
  ActionSheetController,
} from '@ionic/angular';
import {
  WorkerTrackingService,
  TrackingData,
} from '../../../services/worker-tracking.service';
import { Subscription } from 'rxjs';

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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private firestore: Firestore,
    private toastController: ToastController,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private workerTrackingService: WorkerTrackingService
  ) {}

  ngOnInit() {
    this.bookingId = this.route.snapshot.paramMap.get('bookingId') || '';
    if (this.bookingId) {
      this.loadBookingAndWorkerData();
    } else {
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
          // No worker assigned, redirect back to searching
          this.router.navigate(['/client/searching', this.bookingId]);
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
          location: workerData['location'] || { lat: 0, lng: 0 },
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

        console.log('Complete worker data:', this.workerData);
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
        this.bookingData = updatedBooking;

        // Handle status changes
        switch (updatedBooking.status) {
          case 'in_progress':
            this.showToast('Worker has started the job!', 'success');
            break;
          case 'completed':
            this.router.navigate(['/client/job-completed', this.bookingId]);
            break;
          case 'cancelled':
            this.showToast('Booking has been cancelled', 'warning');
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

  private callWorker() {
    if (this.workerData?.phone) {
      window.open(`tel:${this.workerData.phone}`, '_system');
    } else {
      this.showToast('Worker phone number not available', 'warning');
    }
  }

  private messageWorker() {
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
}
