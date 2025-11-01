import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  getDocs,
  Timestamp,
} from '@angular/fire/firestore';
import {
  LoadingController,
  ToastController,
  AlertController,
} from '@ionic/angular';
import { AuthService } from '../../../services/auth.service';
import { WorkerMatchingService } from '../../../services/worker-matching.service';
// Import and extend ServiceCategory interface to match select-location
export interface ServiceCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  averagePrice: number;
  serviceChargeRate: number;
  estimatedDuration: number; // in minutes
  services: string[];
  servicesQuickBookingPricing?: number[]; // Array of prices for quick booking
  servicesQuickBookingUnit?: string[]; // Array of units (per_hour, per_day, etc.)
  isActive: boolean;
  createdAt: any;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  city?: string;
  province?: string;
}

export interface BookingData {
  clientId: string;
  categoryId: string;
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
  estimatedDuration: number;
  status:
    | 'searching'
    | 'accepted'
    | 'on-the-way'
    | 'in-progress'
    | 'completed'
    | 'cancelled';
  assignedWorker: string | null;
  createdAt: Timestamp;
  scheduledDate?: Timestamp;
  scheduledTime?: string;
}

export interface WorkerNotification {
  title: string;
  message: string;
  bookingId: string;
  createdAt: Timestamp;
  read: boolean;
  type: 'booking_request';
}

@Component({
  selector: 'app-confirm-booking',
  templateUrl: './confirm-booking.page.html',
  styleUrls: ['./confirm-booking.page.scss'],
  standalone: false,
})
export class ConfirmBookingPage implements OnInit {
  category: ServiceCategory | null = null;
  selectedService: string = '';
  selectedLocation: LocationData | null = null;
  isQuickBooking = false;

  // Pricing calculation
  basePrice: number = 0;
  platformFee: number = 0;
  transportationFee: number = 50; // Fixed transportation fee
  totalPrice: number = 0;

  isLoading = false;
  isBooking = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private firestore: Firestore,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private alertController: AlertController,
    private authService: AuthService,
    private workerMatchingService: WorkerMatchingService
  ) {
    // Get data from navigation state
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      const state = navigation.extras.state;
      this.category = state['category'];
      this.selectedService = state['selectedService'];
      this.selectedLocation = state['selectedLocation'];

      if (this.category) {
        this.calculatePricing();
      }
    }
  }

  ngOnInit() {
    // Check if this is a quick booking
    this.route.queryParams.subscribe((params) => {
      this.isQuickBooking = params['type'] === 'quick';
    });

    if (!this.category || !this.selectedService || !this.selectedLocation) {
      // If no data, redirect back to select category
      this.router.navigate(['/client/select-category']);
    }
  }

  calculatePricing() {
    if (!this.category || !this.selectedService) return;

    // Get service-specific price from servicesQuickBookingPricing
    const serviceIndex = this.category.services.indexOf(this.selectedService);
    this.basePrice = this.getServicePrice(serviceIndex);

    // Platform fee is 10% of base price
    this.platformFee = Math.round(
      this.basePrice * (this.category.serviceChargeRate || 0.1)
    );

    // Calculate total: base price + platform fee + transportation fee
    this.totalPrice =
      this.basePrice + this.platformFee + this.transportationFee;
  }

  async confirmBooking() {
    if (!this.category || !this.selectedService || !this.selectedLocation) {
      await this.showToast('Missing booking information', 'danger');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Confirm Booking',
      message: `Are you sure you want to book ${
        this.selectedService
      } for ${this.formatPrice(this.totalPrice)}?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Confirm',
          handler: () => {
            this.createBooking();
          },
        },
      ],
    });

    await alert.present();
  }

  async createBooking() {
    this.isBooking = true;

    try {
      const loading = await this.loadingController.create({
        message: 'Creating your booking...',
        spinner: 'crescent',
      });
      await loading.present();

      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        await this.showToast('Please log in to create a booking', 'danger');
        return;
      }

      // Create booking document
      const bookingData: Omit<BookingData, 'id'> = {
        clientId: currentUser.uid,
        categoryId: this.category!.id,
        categoryName: this.category!.name,
        subService: this.selectedService,
        location: {
          lat: this.selectedLocation!.latitude,
          lng: this.selectedLocation!.longitude,
          address: this.selectedLocation!.address,
          ...(this.selectedLocation?.city && { city: this.selectedLocation.city }),
          ...(this.selectedLocation?.province && { province: this.selectedLocation.province }),
        },
        pricing: {
          basePrice: this.basePrice,
          serviceCharge: this.platformFee,
          total: this.totalPrice,
        },
        estimatedDuration: this.category!.estimatedDuration || 60,
        status: 'searching',
        assignedWorker: null,
        createdAt: Timestamp.now(),
      };

      // Add booking to Firestore - use appropriate collection based on booking type
      const collectionName = this.isQuickBooking ? 'quickbookings' : 'bookings';
      const bookingsRef = collection(this.firestore, collectionName);
      const bookingDoc = await addDoc(bookingsRef, bookingData);

      await loading.dismiss();
      this.isBooking = false;

      await this.showToast(
        'Booking created successfully! Searching for workers...',
        'success'
      );

      // Navigate to searching page immediately with appropriate parameters
      if (this.isQuickBooking) {
        this.router.navigate(['/client/searching', bookingDoc.id], {
          queryParams: { type: 'quick' },
        });
      } else {
        this.router.navigate(['/client/searching', bookingDoc.id]);
      }

      // Start worker matching process in background (don't await)
      const bookingType = (this.isQuickBooking ? 'quick' : 'regular') as
        | 'quick'
        | 'regular';
      const completeBookingData = {
        id: bookingDoc.id,
        ...bookingData,
        estimatedDuration: `${this.category!.estimatedDuration || 60} minutes`,
        pricing: {
          ...bookingData.pricing,
          transportFee: 0, // Will be calculated by worker matching service
        },
        bookingType,
      };

      // Fire and forget - let this run in background
      this.workerMatchingService
        .findAndNotifyWorkers(completeBookingData)
        .catch((error) => {
          console.error('Error in worker matching:', error);
        });
    } catch (error) {
      console.error('Error creating booking:', error);
      this.isBooking = false;
      await this.showToast(
        'Error creating booking. Please try again.',
        'danger'
      );
    }
  }

  async notifyMatchingWorkers(bookingId: string) {
    try {
      // Query workers collection for matching skills
      const workersRef = collection(this.firestore, 'workers');
      const q = query(
        workersRef,
        where('skills', 'array-contains-any', [
          this.category!.id,
          this.selectedService,
        ]),
        where('availability', '==', 'online'),
        where('verificationStatus', '==', 'verified')
      );

      const querySnapshot = await getDocs(q);

      const notificationPromises: Promise<any>[] = [];

      querySnapshot.forEach((workerDoc) => {
        const workerId = workerDoc.id;

        // Create notification for each matching worker
        const notificationData: WorkerNotification = {
          title: `New ${this.category!.name} Job Nearby`,
          message: `Client requested ${this.selectedService} service near your area.`,
          bookingId,
          createdAt: Timestamp.now(),
          read: false,
          type: 'booking_request',
        };

        const notificationRef = collection(
          this.firestore,
          `workers/${workerId}/notifications`
        );
        notificationPromises.push(addDoc(notificationRef, notificationData));
      });

      await Promise.all(notificationPromises);
      console.log(`Notified ${querySnapshot.size} matching workers`);
    } catch (error) {
      console.error('Error notifying workers:', error);
    }
  }

  editLocation() {
    if (this.isQuickBooking) {
      this.router.navigate(['/client/select-location', this.category?.id], {
        queryParams: { type: 'quick' },
      });
    } else {
      this.router.navigate(['/client/select-location', this.category?.id]);
    }
  }

  goBack() {
    if (this.isQuickBooking) {
      this.router.navigate(['/client/select-location', this.category?.id], {
        queryParams: { type: 'quick' },
      });
    } else {
      this.router.navigate(['/client/select-location', this.category?.id]);
    }
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
    await toast.present();
  }

  // Helper method to get service price from servicesQuickBookingPricing
  getServicePrice(serviceIndex: number): number {
    if (
      this.category?.servicesQuickBookingPricing &&
      this.category.servicesQuickBookingPricing[serviceIndex] !== undefined
    ) {
      return this.category.servicesQuickBookingPricing[serviceIndex];
    }
    // Fallback to average price
    return this.category?.averagePrice || 0;
  }

  // Helper method to get formatted unit from servicesQuickBookingUnit
  getServiceUnit(serviceIndex: number): string {
    if (
      this.category?.servicesQuickBookingUnit &&
      this.category.servicesQuickBookingUnit[serviceIndex]
    ) {
      const unit = this.category.servicesQuickBookingUnit[serviceIndex];
      // Convert unit format: per_hour -> /hr, per_day -> /day, etc.
      switch (unit.toLowerCase()) {
        case 'per_hour':
          return '/hr';
        case 'per_day':
          return '/day';
        case 'per_week':
          return '/week';
        case 'per_month':
          return '/month';
        case 'per_project':
        case 'per_job':
          return '';
        default:
          return `/${unit.replace('per_', '')}`;
      }
    }
    return '/hr'; // Default fallback
  }

  // Helper method to get price with unit for selected service
  getSelectedServicePriceWithUnit(): string {
    if (!this.selectedService || !this.category) return '₱0';
    const serviceIndex = this.category.services.indexOf(this.selectedService);
    const price = this.getServicePrice(serviceIndex);
    const unit = this.getServiceUnit(serviceIndex);
    return `₱${price.toLocaleString()}${unit}`;
  }

  // Helper method to get formatted address
  getFormattedAddress(): string {
    if (!this.selectedLocation) return 'No location selected';

    // If we have a proper address, use it
    if (
      this.selectedLocation.address &&
      !this.selectedLocation.address.includes('Selected Location') &&
      !this.selectedLocation.address.match(/^-?\d+\.\d+, -?\d+\.\d+$/)
    ) {
      return this.selectedLocation.address;
    }

    // Otherwise, show city and province if available
    const parts = [];
    if (this.selectedLocation.city) parts.push(this.selectedLocation.city);
    if (this.selectedLocation.province)
      parts.push(this.selectedLocation.province);

    if (parts.length > 0) {
      return parts.join(', ');
    }

    // Fallback to coordinates
    return `${this.selectedLocation.latitude.toFixed(
      4
    )}, ${this.selectedLocation.longitude.toFixed(4)}`;
  }

  // Helper method to format price
  formatPrice(price: number): string {
    return `₱${price.toLocaleString()}`;
  }

  // Helper method to get card gradient
  getCardGradient(color: string): string {
    return `linear-gradient(135deg, ${color}, ${color}cc)`;
  }
}
