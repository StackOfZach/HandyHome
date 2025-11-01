import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { LoadingController, ToastController } from '@ionic/angular';
import { Geolocation } from '@capacitor/geolocation';
// Import and extend ServiceCategory interface
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

@Component({
  selector: 'app-select-location',
  templateUrl: './select-location.page.html',
  styleUrls: ['./select-location.page.scss'],
  standalone: false,
})
export class SelectLocationPage implements OnInit {
  categoryId: string = '';
  category: ServiceCategory | null = null;
  selectedService: string | null = null;
  selectedLocation: LocationData | null = null;
  initialMapLocation: { lat: number; lng: number } | null = null;
  isLoading = true;
  isLoadingLocation = false;
  isLoadingAddress = false;
  isQuickBooking = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private firestore: Firestore,
    private loadingController: LoadingController,
    private toastController: ToastController
  ) {}

  async ngOnInit() {
    // Check if this is a quick booking
    this.route.queryParams.subscribe((params) => {
      this.isQuickBooking = params['type'] === 'quick';
    });

    this.categoryId = this.route.snapshot.paramMap.get('categoryId') || '';
    if (this.categoryId) {
      await this.loadCategoryDetails();
    } else {
      this.router.navigate(['/client/select-category']);
    }
  }

  async loadCategoryDetails() {
    try {
      const loading = await this.loadingController.create({
        message: 'Loading category details...',
        spinner: 'crescent',
      });
      await loading.present();

      const categoryRef = doc(
        this.firestore,
        'serviceCategories',
        this.categoryId
      );
      const categoryDoc = await getDoc(categoryRef);

      if (categoryDoc.exists()) {
        const data = categoryDoc.data() as Omit<ServiceCategory, 'id'>;
        this.category = {
          id: categoryDoc.id,
          ...data,
        };
      } else {
        await this.showToast('Category not found', 'danger');
        this.router.navigate(['/client/select-category']);
        return;
      }

      await loading.dismiss();
      this.isLoading = false;
    } catch (error) {
      console.error('Error loading category details:', error);
      this.isLoading = false;
      await this.showToast(
        'Error loading category details. Please try again.',
        'danger'
      );
    }
  }

  async getCurrentLocation() {
    this.isLoadingLocation = true;
    try {
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });

      // Update the map to center on current location
      this.initialMapLocation = {
        lat: coordinates.coords.latitude,
        lng: coordinates.coords.longitude,
      };

      // This will trigger the map picker to update its location
      this.onLocationSelected({
        lat: coordinates.coords.latitude,
        lng: coordinates.coords.longitude,
      });

      await this.showToast('Current location selected', 'success');
    } catch (error) {
      console.error('Error getting current location:', error);
      await this.showToast(
        'Unable to get current location. Please select manually.',
        'warning'
      );
    }
    this.isLoadingLocation = false;
  }

  onLocationSelected(location: { lat: number; lng: number }) {
    console.log('Location selected:', location);
    
    // Update the selected location with coordinates immediately
    this.selectedLocation = {
      latitude: location.lat,
      longitude: location.lng,
      address: 'Selected Location', // Temporary placeholder
      city: '',
      province: ''
    };

    // Reverse geocode to get address details using Nominatim
    this.reverseGeocode(location.lat, location.lng);
  }

  async reverseGeocode(lat: number, lng: number) {
    this.isLoadingAddress = true;
    try {
      // Using Nominatim (OpenStreetMap) for reverse geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`
      );
      
      if (response.ok) {
        const data = await response.json();
        
        if (this.selectedLocation) {
          // Set the main address
          this.selectedLocation.address = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          
          // Extract city from various possible fields
          this.selectedLocation.city = 
            data.address?.city || 
            data.address?.town || 
            data.address?.village || 
            data.address?.municipality || 
            data.address?.county || '';
            
          // Extract province/state
          this.selectedLocation.province = 
            data.address?.state || 
            data.address?.province || 
            data.address?.region || '';
            
          console.log('Nominatim geocoding result:', {
            address: this.selectedLocation.address,
            city: this.selectedLocation.city,
            province: this.selectedLocation.province,
            coordinates: { lat, lng }
          });
        }
      } else {
        throw new Error('Nominatim API response not ok');
      }
    } catch (error) {
      console.error('Error reverse geocoding with Nominatim:', error);
      // Fallback to coordinates if geocoding fails
      if (this.selectedLocation) {
        this.selectedLocation.address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        this.selectedLocation.city = '';
        this.selectedLocation.province = '';
      }
    } finally {
      this.isLoadingAddress = false;
    }
  }

  refreshAddress() {
    if (this.selectedLocation) {
      this.reverseGeocode(this.selectedLocation.latitude, this.selectedLocation.longitude);
    }
  }

  onServiceChange(event: any) {
    console.log('Service changed to:', event.detail.value);
    console.log('Current selectedService before:', this.selectedService);
    this.selectedService = event.detail.value;
    console.log('Current selectedService after:', this.selectedService);
  }

  canProceed(): boolean {
    return !!(this.selectedService && this.selectedLocation);
  }

  proceedToConfirm() {
    if (!this.canProceed()) {
      this.showToast('Please select a service and location', 'warning');
      return;
    }

    // Navigate to confirm booking with data and quick booking parameter
    const navigationExtras: any = {
      state: {
        categoryId: this.categoryId,
        category: this.category,
        selectedService: this.selectedService,
        selectedLocation: this.selectedLocation,
      },
    };

    // Add query params if it's a quick booking
    if (this.isQuickBooking) {
      navigationExtras.queryParams = { type: 'quick' };
    }

    this.router.navigate(['/client/confirm-booking'], navigationExtras);
  }

  goBack() {
    if (this.isQuickBooking) {
      this.router.navigate(['/client/select-category'], {
        queryParams: { type: 'quick' },
      });
    } else {
      this.router.navigate(['/client/select-category']);
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
    if (this.category?.servicesQuickBookingPricing && 
        this.category.servicesQuickBookingPricing[serviceIndex] !== undefined) {
      return this.category.servicesQuickBookingPricing[serviceIndex];
    }
    // Fallback to average price
    return this.category?.averagePrice || 0;
  }

  // Helper method to get formatted unit from servicesQuickBookingUnit
  getServiceUnit(serviceIndex: number): string {
    if (this.category?.servicesQuickBookingUnit && 
        this.category.servicesQuickBookingUnit[serviceIndex]) {
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

  // Helper method to get price with unit for a specific service
  getServicePriceWithUnit(service: string): string {
    const serviceIndex = this.category?.services.indexOf(service) || 0;
    const price = this.getServicePrice(serviceIndex);
    const unit = this.getServiceUnit(serviceIndex);
    return `₱${price.toLocaleString()}${unit}`;
  }

  // Helper method to get selected service price
  getSelectedServicePrice(): number {
    if (!this.selectedService || !this.category) return 0;
    const serviceIndex = this.category.services.indexOf(this.selectedService);
    return this.getServicePrice(serviceIndex);
  }

  // Helper method to get minimum price for category display
  getCategoryMinimumPrice(): number {
    if (this.category?.servicesQuickBookingPricing && 
        this.category.servicesQuickBookingPricing.length > 0) {
      return Math.min(...this.category.servicesQuickBookingPricing);
    }
    return this.category?.averagePrice || 0;
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
