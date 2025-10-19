import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LoadingController,
  ToastController,
  AlertController,
} from '@ionic/angular';
import {
  Firestore,
  collection,
  addDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import {
  AuthService,
  UserProfile,
  UserLocation,
} from '../../services/auth.service';
import {
  LocationService,
  LocationCoordinates,
} from '../../services/location.service';
import { MapComponent, MapPin } from '../../components/map/map.component';

export interface ServiceCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export interface BookingLocation {
  id: string;
  contactPerson: string;
  phoneNumber: string;
  fullAddress: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  isDefault?: boolean;
}

export interface BookingData {
  clientId: string;
  clientName?: string;
  title: string;
  description: string;
  category: string;
  schedule: {
    date: string;
    time: string;
  };
  locations: BookingLocation[];
  priceType: 'per-hour' | 'per-day' | 'fixed-price';
  price: number;
  serviceCharge: number;
  transportFee: number;
  total: number;
  images: string[];
  status: 'pending' | 'accepted' | 'in-progress' | 'completed' | 'cancelled';
  createdAt: Date;
}

@Component({
  selector: 'app-book-service',
  templateUrl: './book-service.page.html',
  styleUrls: ['./book-service.page.scss'],
  standalone: false,
})
export class BookServicePage implements OnInit {
  currentStep = 1;
  totalSteps = 4;

  // Form Groups
  serviceForm!: FormGroup;
  locationForm!: FormGroup;

  // Data
  userProfile: UserProfile | null = null;
  serviceCategories: ServiceCategory[] = [];
  selectedImages: string[] = [];
  selectedFiles: File[] = [];
  locations: BookingLocation[] = [];
  savedLocations: UserLocation[] = []; // User's saved locations from profile

  // Cost Calculation
  basePrice = 0;
  serviceCharge = 0;
  transportFee = 50; // Fixed transport fee
  totalCost = 0;

  // UI State
  isLoading = false;
  isSubmitting = false;
  showCostBreakdown = false;

  // Map State
  showLocationMap = false;
  selectedMapCoordinates: LocationCoordinates | null = null;
  @ViewChild('mapComponent') mapComponent?: MapComponent;

  constructor(
    private formBuilder: FormBuilder,
    private router: Router,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private alertController: AlertController,
    private firestore: Firestore,
    private authService: AuthService,
    private locationService: LocationService
  ) {
    this.initializeForms();
    this.initializeCategories();
  }

  ngOnInit() {
    this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile) {
        this.loadUserSavedLocations();
      }
    });
  }

  private initializeForms() {
    this.serviceForm = this.formBuilder.group({
      title: ['', [Validators.required, Validators.minLength(5)]],
      description: ['', [Validators.required, Validators.minLength(10)]],
      category: ['', Validators.required],
      scheduleDate: ['', Validators.required],
      scheduleTime: ['', Validators.required],
      price: [0, [Validators.required, Validators.min(1)]],
      priceType: ['per-hour', Validators.required],
    });

    this.locationForm = this.formBuilder.group({
      contactPerson: ['', Validators.required],
      phoneNumber: ['', [Validators.required, Validators.pattern(/^09\d{9}$/)]],
      fullAddress: ['', [Validators.required, Validators.minLength(10)]],
    });

    // Watch for price changes to calculate costs
    this.serviceForm.get('price')?.valueChanges.subscribe((price) => {
      this.calculateCosts(price || 0);
    });
  }

  private initializeCategories() {
    this.serviceCategories = [
      {
        id: 'cleaning',
        name: 'Cleaning',
        icon: 'sparkles-outline',
        color: 'from-blue-500 to-cyan-500',
        description: 'House & office cleaning',
      },
      {
        id: 'plumbing',
        name: 'Plumbing',
        icon: 'water-outline',
        color: 'from-indigo-500 to-blue-500',
        description: 'Pipes & water systems',
      },
      {
        id: 'electrical',
        name: 'Electrical',
        icon: 'flash-outline',
        color: 'from-yellow-500 to-orange-500',
        description: 'Wiring & installations',
      },
      {
        id: 'gardening',
        name: 'Gardening',
        icon: 'leaf-outline',
        color: 'from-green-500 to-emerald-500',
        description: 'Landscaping & plants',
      },
      {
        id: 'carpentry',
        name: 'Carpentry',
        icon: 'hammer-outline',
        color: 'from-amber-500 to-yellow-500',
        description: 'Wood work & furniture',
      },
      {
        id: 'painting',
        name: 'Painting',
        icon: 'brush-outline',
        color: 'from-purple-500 to-pink-500',
        description: 'Interior & exterior',
      },
      {
        id: 'appliance',
        name: 'Appliances',
        icon: 'build-outline',
        color: 'from-gray-500 to-slate-500',
        description: 'Repair & maintenance',
      },
      {
        id: 'custom',
        name: 'Custom',
        icon: 'construct-outline',
        color: 'from-red-500 to-pink-500',
        description: 'Other services',
      },
    ];
  }

  private calculateCosts(price: number) {
    this.basePrice = price;
    this.serviceCharge = Math.round(price * 0.1); // 10% service charge
    this.totalCost = this.basePrice + this.serviceCharge + this.transportFee;
  }

  // Step Navigation
  nextStep() {
    if (this.currentStep === 1 && this.serviceForm.valid) {
      this.currentStep = 2;
    } else if (this.currentStep === 2 && this.locations.length > 0) {
      this.currentStep = 3;
    } else if (this.currentStep === 3) {
      this.currentStep = 4;
    } else {
      this.validateCurrentStep();
    }
  }

  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  goToStep(step: number) {
    // Allow navigation to previous steps or current step
    if (step <= this.currentStep || this.canNavigateToStep(step)) {
      this.currentStep = step;
    }
  }

  private canNavigateToStep(step: number): boolean {
    switch (step) {
      case 1:
        return true;
      case 2:
        return this.serviceForm.valid;
      case 3:
        return this.serviceForm.valid && this.locations.length > 0;
      case 4:
        return this.serviceForm.valid && this.locations.length > 0;
      default:
        return false;
    }
  }

  private validateCurrentStep() {
    if (this.currentStep === 1) {
      this.markFormGroupTouched(this.serviceForm);
      this.showToast('Please fill in all required fields', 'warning');
    } else if (this.currentStep === 2 && this.locations.length === 0) {
      this.showToast('Please add at least one location', 'warning');
    }
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  // Location Management
  async addLocation() {
    if (this.locationForm.valid) {
      const newLocation: BookingLocation = {
        id: Date.now().toString(),
        contactPerson: this.locationForm.value.contactPerson,
        phoneNumber: this.locationForm.value.phoneNumber,
        fullAddress: this.locationForm.value.fullAddress,
        coordinates: this.selectedMapCoordinates
          ? {
              latitude: this.selectedMapCoordinates.latitude,
              longitude: this.selectedMapCoordinates.longitude,
            }
          : undefined,
        isDefault: this.locations.length === 0,
      };

      this.locations.push(newLocation);
      this.showToast('Location added successfully', 'success');

      // Ask user if they want to save this location to their profile
      const alert = await this.alertController.create({
        header: 'Save Location',
        message:
          'Would you like to save this location to your profile for future use?',
        buttons: [
          {
            text: 'No',
            role: 'cancel',
            handler: () => {
              this.locationForm.reset();
              this.selectedMapCoordinates = null;
              this.showLocationMap = false;
            },
          },
          {
            text: 'Yes, Save',
            handler: async () => {
              const locationData = {
                contactPerson: this.locationForm.value.contactPerson,
                phoneNumber: this.locationForm.value.phoneNumber,
                fullAddress: this.locationForm.value.fullAddress,
                coordinates: this.selectedMapCoordinates
                  ? {
                      latitude: this.selectedMapCoordinates.latitude,
                      longitude: this.selectedMapCoordinates.longitude,
                    }
                  : undefined,
              };

              const savedLocation = await this.authService.saveUserLocation(
                locationData
              );
              if (savedLocation) {
                this.loadUserSavedLocations();
                this.showToast('Location saved to your profile!', 'success');
              } else {
                this.showToast('Failed to save location to profile', 'warning');
              }
              this.locationForm.reset();
              this.selectedMapCoordinates = null;
              this.showLocationMap = false;
            },
          },
        ],
      });

      await alert.present();
    } else {
      this.markFormGroupTouched(this.locationForm);
    }
  }

  removeLocation(locationId: string) {
    this.locations = this.locations.filter((loc) => loc.id !== locationId);

    // If we removed the default location, make the first one default
    if (
      this.locations.length > 0 &&
      !this.locations.some((loc) => loc.isDefault)
    ) {
      this.locations[0].isDefault = true;
    }
  }

  setDefaultLocation(locationId: string) {
    this.locations.forEach((loc) => {
      loc.isDefault = loc.id === locationId;
    });
  }

  // User Saved Locations Management
  private loadUserSavedLocations() {
    this.savedLocations = this.authService.getUserLocations();
  }

  async saveLocationToProfile() {
    if (this.locationForm.valid) {
      const locationData = {
        contactPerson: this.locationForm.value.contactPerson,
        phoneNumber: this.locationForm.value.phoneNumber,
        fullAddress: this.locationForm.value.fullAddress,
        coordinates: this.selectedMapCoordinates
          ? {
              latitude: this.selectedMapCoordinates.latitude,
              longitude: this.selectedMapCoordinates.longitude,
            }
          : undefined,
      };

      const savedLocation = await this.authService.saveUserLocation(
        locationData
      );
      if (savedLocation) {
        this.loadUserSavedLocations();
        this.showToast('Location saved to your profile!', 'success');
      } else {
        this.showToast('Failed to save location to profile', 'danger');
      }
    }
  }

  loadSavedLocationToForm(location: UserLocation) {
    this.locationForm.patchValue({
      contactPerson: location.contactPerson,
      phoneNumber: location.phoneNumber,
      fullAddress: location.fullAddress,
    });
  }

  addSavedLocationToBooking(location: UserLocation) {
    const newLocation: BookingLocation = {
      id: Date.now().toString(),
      contactPerson: location.contactPerson,
      phoneNumber: location.phoneNumber,
      fullAddress: location.fullAddress,
      coordinates: location.coordinates,
      isDefault: this.locations.length === 0,
    };

    this.locations.push(newLocation);
    this.showToast('Saved location added to booking', 'success');
  }

  async deleteSavedLocation(locationId: string) {
    const success = await this.authService.deleteUserLocation(locationId);
    if (success) {
      this.loadUserSavedLocations();
      this.showToast('Location deleted from profile', 'success');
    } else {
      this.showToast('Failed to delete location', 'danger');
    }
  }

  // Map-related methods
  toggleLocationMap() {
    this.showLocationMap = !this.showLocationMap;
  }

  async onMapPinPlaced(pin: MapPin) {
    const coords = pin.coordinates || pin.position;
    if (!coords) return;

    // Convert to LocationCoordinates format
    const locationCoords: LocationCoordinates = {
      latitude: coords.latitude ?? coords.lat ?? 0,
      longitude: coords.longitude ?? coords.lng ?? 0,
    };

    this.selectedMapCoordinates = locationCoords;

    try {
      // Try to get address from coordinates
      const geocodeResult = await this.locationService.reverseGeocode(
        locationCoords
      );

      if (geocodeResult) {
        // Auto-fill the address field
        this.locationForm.patchValue({
          fullAddress: geocodeResult.address,
        });

        this.showToast('Location selected from map', 'success');
      }
    } catch (error) {
      console.error('Error getting address from coordinates:', error);
      this.showToast(
        'Location selected, please enter address manually',
        'warning'
      );
    }
  }

  async getCurrentLocationAndFillForm() {
    const loading = await this.loadingController.create({
      message: 'Getting your location...',
    });
    await loading.present();

    try {
      const location = await this.locationService.getCurrentLocation();
      this.selectedMapCoordinates = location;

      // Try to get address
      const geocodeResult = await this.locationService.reverseGeocode(location);

      if (geocodeResult) {
        this.locationForm.patchValue({
          fullAddress: geocodeResult.address,
        });
        this.showToast('Current location added', 'success');
      } else {
        this.showToast(
          'Location found, please enter address details',
          'warning'
        );
      }

      await loading.dismiss();
    } catch (error) {
      await loading.dismiss();
      console.error('Error getting current location:', error);
      this.showToast('Unable to get current location', 'danger');
    }
  }

  // Image Management
  onImageSelected(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      const totalImages = this.selectedImages.length + files.length;
      if (totalImages > 5) {
        this.showToast('Maximum 5 images allowed', 'warning');
        return;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Store the actual file for upload
        this.selectedFiles.push(file);

        // Create preview URL
        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.selectedImages.push(e.target.result);
        };
        reader.readAsDataURL(file);
      }
    }
  }

  removeImage(index: number) {
    this.selectedImages.splice(index, 1);
    this.selectedFiles.splice(index, 1);
  }

  private async uploadImages(): Promise<string[]> {
    // Convert images to base64 strings for storage in Firestore
    const base64Images: string[] = [];

    for (const file of this.selectedFiles) {
      const base64 = await this.convertFileToBase64(file);
      base64Images.push(base64);
    }

    return base64Images;
  }

  private convertFileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  }

  // Form Submission
  async submitBooking() {
    if (!this.userProfile) {
      console.error('User not authenticated - userProfile is null');
      this.showToast('User not authenticated', 'danger');
      this.router.navigate(['/pages/auth/login']);
      return;
    }

    console.log('Starting booking submission for user:', this.userProfile.uid);

    this.isSubmitting = true;
    const loading = await this.loadingController.create({
      message: 'Submitting your booking...',
    });
    await loading.present();

    try {
      // Upload images first
      const imageUrls = await this.uploadImages();

      // Prepare booking data
      const bookingData: Omit<BookingData, 'createdAt'> = {
        clientId: this.userProfile.uid,
        clientName: this.userProfile.fullName,
        title: this.serviceForm.value.title,
        description: this.serviceForm.value.description,
        category: this.serviceForm.value.category,
        schedule: {
          date: this.serviceForm.value.scheduleDate,
          time: this.serviceForm.value.scheduleTime,
        },
        locations: this.locations,
        priceType: this.serviceForm.value.priceType,
        price: this.basePrice,
        serviceCharge: this.serviceCharge,
        transportFee: this.transportFee,
        total: this.totalCost,
        images: imageUrls,
        status: 'pending',
      };

      // Save to Firestore
      const bookingsRef = collection(this.firestore, 'bookings');
      await addDoc(bookingsRef, {
        ...bookingData,
        createdAt: serverTimestamp(),
      });

      await loading.dismiss();
      this.showToast('Booking submitted successfully!', 'success');

      console.log('Booking saved successfully, navigating to my-bookings');

      // Double-check authentication before navigation
      const currentUser = this.authService.getCurrentUser();
      const currentProfile = this.authService.getCurrentUserProfile();

      if (!currentUser || !currentProfile) {
        console.error('User authentication lost after booking submission');
        this.showToast('Authentication error. Please login again.', 'warning');
        this.router.navigate(['/pages/auth/login']);
        return;
      }

      console.log('User still authenticated, proceeding to my-bookings');
      // Navigate to My Bookings page
      this.router.navigate(['/pages/my-bookings']);
    } catch (error) {
      await loading.dismiss();
      console.error('Error submitting booking:', error);

      // Check if the error is related to authentication
      if (error instanceof Error && error.message.includes('auth')) {
        console.error('Authentication error during booking submission');
        this.showToast('Authentication error. Please login again.', 'danger');
        this.router.navigate(['/pages/auth/login']);
      } else {
        this.showToast('Failed to submit booking. Please try again.', 'danger');
      }
    } finally {
      this.isSubmitting = false;
    }
  }

  // Helper Methods
  getCategoryIcon(categoryId: string): string {
    const category = this.serviceCategories.find(
      (cat) => cat.id === categoryId
    );
    return category?.icon || 'help-outline';
  }

  getCategoryName(categoryId: string): string {
    const category = this.serviceCategories.find(
      (cat) => cat.id === categoryId
    );
    return category?.name || categoryId;
  }

  getProgressPercentage(): number {
    return (this.currentStep / this.totalSteps) * 100;
  }

  isStepCompleted(step: number): boolean {
    switch (step) {
      case 1:
        return this.serviceForm.valid;
      case 2:
        return this.locations.length > 0;
      case 3:
        return true; // Optional step
      case 4:
        return false; // Always incomplete until submitted
      default:
        return false;
    }
  }

  private async showToast(
    message: string,
    color: 'success' | 'warning' | 'danger' = 'success'
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    toast.present();
  }

  // Navigation
  goBack() {
    if (this.currentStep === 1) {
      this.router.navigate(['/pages/client/dashboard']);
    } else {
      this.previousStep();
    }
  }

  getMinDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}
