import { Component, OnInit } from '@angular/core';
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
  getDocs,
  query,
} from '@angular/fire/firestore';
import {
  AuthService,
  UserLocation,
  UserProfile,
} from '../../../services/auth.service';
import {
  DashboardService,
  ServiceCategory,
} from '../../../services/dashboard.service';
import { Geolocation } from '@capacitor/geolocation';

interface Service {
  id: string;
  name: string;
  category: string;
}

@Component({
  selector: 'app-book-service',
  templateUrl: './book-service.page.html',
  styleUrls: ['./book-service.page.scss'],
  standalone: false,
})
export class BookServicePage implements OnInit {
  selectedService = '';
  selectedSubService = '';
  selectedDateTime = '';
  minBudget: number | null = null;
  maxBudget: number | null = null;
  additionalDetails = '';
  isLoading = false;
  showValidation = false;
  currentUser: any = null;
  userProfile: UserProfile | null = null;
  services: Service[] = [];
  serviceCategories: ServiceCategory[] = [];
  availableSubServices: string[] = [];
  minDate = new Date().toISOString();
  maxDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year from now

  // Time restrictions for specific services
  timeRestrictedServices = ['cleaning', 'laundry'];
  restrictedTimeStart = '08:00';
  restrictedTimeEnd = '17:00';
  showTimeRestriction = false;

  // Location properties
  locationType: 'current' | 'custom' | 'saved' | 'map' | '' = '';
  currentLocationAddress = '';
  customAddress = '';
  city = '';
  zipCode = '';
  locationError = '';
  currentCoordinates: { lat: number; lng: number } | null = null;

  // Map picker properties
  mapPickedLocation: { lat: number; lng: number } | null = null;
  mapSelectedAddress = '';
  loadingMapAddress = false;

  // Saved locations properties
  savedLocations: UserLocation[] = [];
  selectedSavedLocationId = '';
  loadingSavedLocations = false;

  constructor(
    private router: Router,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private alertController: AlertController,
    private firestore: Firestore,
    private authService: AuthService,
    private dashboardService: DashboardService
  ) {}

  async ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();
    if (this.currentUser) {
      this.userProfile = await this.authService.getUserProfile(
        this.currentUser.uid
      );
    }
    await this.loadServices();
    await this.loadServiceCategories();
    await this.loadSavedLocations();
  }

  async loadServiceCategories() {
    try {
      // Fetch from DashboardService with proper filtering
      const allCategories = await this.dashboardService.getServiceCategories();

      // Filter only active categories and their active sub-services
      this.serviceCategories = allCategories
        .filter((category) => category.isActive)
        .map((category) => ({
          ...category,
          services: category.services || [], // Ensure services array exists
        }));
    } catch (error) {
      console.error('Error loading service categories:', error);
      this.serviceCategories = [];
    }
  }

  async loadServices() {
    try {
      const servicesQuery = query(
        collection(this.firestore, 'serviceCategories')
      );
      const querySnapshot = await getDocs(servicesQuery);

      this.services = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        this.services.push({
          id: doc.id,
          name: data['name'] || data['category'],
          category: data['category'] || 'General',
        });
      });

      // Fallback services if none exist in Firestore
      if (this.services.length === 0) {
        this.services = [
          { id: '1', name: 'Plumbing', category: 'Home Repair' },
          { id: '2', name: 'Electrical Work', category: 'Home Repair' },
          { id: '3', name: 'House Cleaning', category: 'Cleaning' },
          { id: '4', name: 'Gardening', category: 'Outdoor' },
          { id: '5', name: 'Carpentry', category: 'Home Repair' },
          { id: '6', name: 'Appliance Repair', category: 'Home Repair' },
        ];
      }
    } catch (error) {
      console.error('Error loading services:', error);
      // Use fallback services
      this.services = [
        { id: '1', name: 'Plumbing', category: 'Home Repair' },
        { id: '2', name: 'Electrical Work', category: 'Home Repair' },
        { id: '3', name: 'House Cleaning', category: 'Cleaning' },
        { id: '4', name: 'Gardening', category: 'Outdoor' },
        { id: '5', name: 'Carpentry', category: 'Home Repair' },
        { id: '6', name: 'Appliance Repair', category: 'Home Repair' },
      ];
    }
  }

  // Service selection methods
  onServiceChange() {
    // Reset sub-service selection when main service changes
    this.selectedSubService = '';
    this.showTimeRestriction = false;
    this.updateAvailableSubServices();
    this.checkTimeRestriction();
  }

  updateAvailableSubServices() {
    const selectedCategory = this.serviceCategories.find(
      (category) => category.name === this.selectedService
    );
    this.availableSubServices = selectedCategory?.services || [];
  }

  // Time validation methods
  onDateTimeChange() {
    if (this.selectedDateTime && this.selectedService) {
      this.validateAndHandleTimeRestriction();
    }
  }

  checkTimeRestriction() {
    const serviceName = this.selectedService.toLowerCase();
    this.showTimeRestriction =
      this.timeRestrictedServices.includes(serviceName);
  }

  validateBookingTime(service: string, dateTime: string): boolean {
    const serviceName = service.toLowerCase();
    if (!this.timeRestrictedServices.includes(serviceName)) {
      return true; // No restrictions for other services
    }

    const bookingDate = new Date(dateTime);
    const timeString = bookingDate.toTimeString().slice(0, 5);

    return (
      timeString >= this.restrictedTimeStart &&
      timeString <= this.restrictedTimeEnd
    );
  }

  async validateAndHandleTimeRestriction() {
    if (
      !this.validateBookingTime(this.selectedService, this.selectedDateTime)
    ) {
      await this.presentTimeRestrictionAlert();
    }
  }

  async presentTimeRestrictionAlert() {
    const selectedDate = new Date(this.selectedDateTime);
    const nextDay = new Date(selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(8, 0, 0, 0); // Set to 8:00 AM next day

    const alert = await this.alertController.create({
      header: 'Time Restriction Notice',
      message: `${this.selectedService} services are only available from ${
        this.restrictedTimeStart
      } to ${
        this.restrictedTimeEnd
      }. Would you like to book for ${nextDay.toLocaleDateString()} at 8:00 AM instead?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            this.selectedDateTime = '';
          },
        },
        {
          text: 'Book Next Day',
          handler: () => {
            this.selectedDateTime = nextDay.toISOString();
          },
        },
      ],
    });
    await alert.present();
  }

  getTimeRestrictionMessage(): string {
    return `⏰ ${this.selectedService} services are available from ${this.restrictedTimeStart} to ${this.restrictedTimeEnd} only.`;
  }

  goBack() {
    this.router.navigate(['/pages/client/dashboard']);
  }

  // Location Methods
  selectLocationType(type: 'current' | 'custom' | 'saved' | 'map') {
    this.locationType = type;
    this.locationError = '';

    if (type === 'current') {
      this.customAddress = '';
      this.city = '';
      this.zipCode = '';
      this.selectedSavedLocationId = '';
      this.mapPickedLocation = null;
      this.mapSelectedAddress = '';
      this.getCurrentLocation();
    } else if (type === 'custom') {
      this.currentLocationAddress = '';
      this.currentCoordinates = null;
      this.selectedSavedLocationId = '';
      this.mapPickedLocation = null;
      this.mapSelectedAddress = '';
    } else if (type === 'saved') {
      this.customAddress = '';
      this.city = '';
      this.zipCode = '';
      this.currentLocationAddress = '';
      this.currentCoordinates = null;
      this.mapPickedLocation = null;
      this.mapSelectedAddress = '';
      this.loadSavedLocations();
    } else if (type === 'map') {
      this.customAddress = '';
      this.city = '';
      this.zipCode = '';
      this.currentLocationAddress = '';
      this.currentCoordinates = null;
      this.selectedSavedLocationId = '';
      // Initialize map with current location if available
      this.initializeMapLocation();
    }
  }

  async getCurrentLocation() {
    try {
      this.locationError = '';
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      });

      this.currentCoordinates = {
        lat: coordinates.coords.latitude,
        lng: coordinates.coords.longitude,
      };

      // Get address from coordinates (reverse geocoding)
      await this.reverseGeocode(
        coordinates.coords.latitude,
        coordinates.coords.longitude
      );
    } catch (error) {
      console.error('Error getting location:', error);
      this.locationError =
        'Unable to get your location. Please check your location permissions.';
      this.currentLocationAddress = '';
      this.currentCoordinates = null;
    }
  }

  async reverseGeocode(lat: number, lng: number) {
    try {
      // Using a simple reverse geocoding approach
      // In production, you might want to use a proper geocoding service
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`
      );

      if (response.ok) {
        const data = await response.json();
        this.currentLocationAddress =
          data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      } else {
        this.currentLocationAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      this.currentLocationAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  }

  isValidLocation(): boolean {
    if (this.locationType === 'current') {
      return !!this.currentCoordinates;
    } else if (this.locationType === 'custom') {
      return !!this.customAddress.trim();
    } else if (this.locationType === 'saved') {
      return !!this.selectedSavedLocationId;
    } else if (this.locationType === 'map') {
      return !!this.mapPickedLocation;
    }
    return false;
  }

  // Map-related methods
  async initializeMapLocation() {
    // Try to get current location for map initialization
    try {
      const coordinates = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      });

      this.mapPickedLocation = {
        lat: coordinates.coords.latitude,
        lng: coordinates.coords.longitude,
      };

      // Get address for the initial location
      await this.getAddressFromCoordinates(this.mapPickedLocation);
    } catch (error) {
      console.warn('Could not get current location for map:', error);
      // Use default location (Manila, Philippines)
      this.mapPickedLocation = { lat: 14.5995, lng: 120.9842 };
      await this.getAddressFromCoordinates(this.mapPickedLocation);
    }
  }

  async onMapLocationSelected(location: { lat: number; lng: number }) {
    this.mapPickedLocation = location;
    console.log('Map location selected:', location);

    // Get address from coordinates using Nominatim
    await this.getAddressFromCoordinates(location);
  }

  async getAddressFromCoordinates(location: { lat: number; lng: number }) {
    try {
      this.loadingMapAddress = true;

      // Use Nominatim for reverse geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.lat}&lon=${location.lng}&zoom=16&addressdetails=1`
      );

      if (response.ok) {
        const data = await response.json();
        this.mapSelectedAddress =
          data.display_name ||
          `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
        console.log('Address retrieved:', this.mapSelectedAddress);
      } else {
        this.mapSelectedAddress = `${location.lat.toFixed(
          6
        )}, ${location.lng.toFixed(6)}`;
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      this.mapSelectedAddress = `${location.lat.toFixed(
        6
      )}, ${location.lng.toFixed(6)}`;
    } finally {
      this.loadingMapAddress = false;
    }
  }

  refreshMapLocation() {
    if (this.mapPickedLocation) {
      this.getAddressFromCoordinates(this.mapPickedLocation);
    }
  }

  async loadSavedLocations() {
    if (!this.currentUser) return;

    try {
      this.loadingSavedLocations = true;
      const userProfile = await this.authService.getUserProfile(
        this.currentUser.uid
      );

      if (userProfile && userProfile.savedLocations) {
        this.savedLocations = userProfile.savedLocations;

        // Auto-select default location if available and no location is selected yet
        if (!this.selectedSavedLocationId) {
          const defaultLocation = this.savedLocations.find(
            (location) => location.isDefault
          );
          if (defaultLocation) {
            this.selectedSavedLocationId = defaultLocation.id;
          }
        }
      } else {
        this.savedLocations = [];
      }
    } catch (error) {
      console.error('Error loading saved locations:', error);
      this.savedLocations = [];
      const toast = await this.toastController.create({
        message: 'Error loading saved locations',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    } finally {
      this.loadingSavedLocations = false;
    }
  }

  selectSavedLocation(location: UserLocation) {
    this.selectedSavedLocationId = location.id;
  }

  async findWorkers() {
    this.showValidation = true;

    if (
      !this.selectedService ||
      (this.availableSubServices.length > 0 && !this.selectedSubService) ||
      !this.selectedDateTime ||
      !this.minBudget ||
      !this.maxBudget ||
      !this.isValidLocation()
    ) {
      const toast = await this.toastController.create({
        message:
          'Please fill in all required fields (service, specific service, date/time, location, and budget)',
        duration: 3000,
        color: 'warning',
      });
      toast.present();
      return;
    }

    // Validate time restriction for cleaning and laundry services
    if (
      !this.validateBookingTime(this.selectedService, this.selectedDateTime)
    ) {
      const toast = await this.toastController.create({
        message: `${this.selectedService} services are only available from ${this.restrictedTimeStart} to ${this.restrictedTimeEnd}. Please select a different time or use the suggested next-day option.`,
        duration: 5000,
        color: 'warning',
      });
      toast.present();
      return;
    }

    // Validate that the selected date/time is not in the past
    const selectedDate = new Date(this.selectedDateTime);
    const now = new Date();

    if (selectedDate <= now) {
      const toast = await this.toastController.create({
        message: 'Please select a future date and time for your service',
        duration: 3000,
        color: 'warning',
      });
      toast.present();
      return;
    }

    // Check if the selected time is within reasonable hours (6 AM to 10 PM)
    // Skip this check for time-restricted services as they have their own validation
    if (
      !this.timeRestrictedServices.includes(this.selectedService.toLowerCase())
    ) {
      const selectedHour = selectedDate.getHours();
      if (selectedHour < 6 || selectedHour > 22) {
        const toast = await this.toastController.create({
          message:
            'Please select a time between 6:00 AM and 10:00 PM for better worker availability',
          duration: 4000,
          color: 'warning',
        });
        toast.present();
        return;
      }
    }

    if (this.minBudget >= this.maxBudget) {
      const toast = await this.toastController.create({
        message: 'Maximum budget must be greater than minimum budget',
        duration: 3000,
        color: 'warning',
      });
      toast.present();
      return;
    }

    if (!this.currentUser || !this.userProfile) {
      const toast = await this.toastController.create({
        message: 'Please log in to continue',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
      return;
    }

    this.isLoading = true;

    try {
      // Prepare location data
      let locationData: any = {};

      if (this.locationType === 'current' && this.currentCoordinates) {
        locationData = {
          locationType: 'current',
          coordinates: this.currentCoordinates,
          address: this.currentLocationAddress,
        };
      } else if (this.locationType === 'custom' && this.customAddress) {
        locationData = {
          locationType: 'custom',
          address: this.customAddress,
          city: this.city || '',
          zipCode: this.zipCode || '',
        };
      } else if (
        this.locationType === 'saved' &&
        this.selectedSavedLocationId
      ) {
        const selectedLocation = this.savedLocations.find(
          (loc) => loc.id === this.selectedSavedLocationId
        );
        if (selectedLocation) {
          locationData = {
            locationType: 'saved',
            address: selectedLocation.fullAddress,
            coordinates: selectedLocation.coordinates
              ? {
                  lat: selectedLocation.coordinates.latitude,
                  lng: selectedLocation.coordinates.longitude,
                }
              : undefined,
            contactPerson: selectedLocation.contactPerson,
            phoneNumber: selectedLocation.phoneNumber,
            savedLocationId: selectedLocation.id,
          };
        }
      } else if (this.locationType === 'map' && this.mapPickedLocation) {
        locationData = {
          locationType: 'map',
          coordinates: this.mapPickedLocation,
          address: this.mapSelectedAddress,
        };
      }

      // Extract date and time from selectedDateTime
      const selectedDate = new Date(this.selectedDateTime);
      const scheduleTime = selectedDate.toTimeString().slice(0, 5); // Extract HH:MM format

      // Create booking in Firestore
      const bookingData = {
        clientId: this.currentUser.uid,
        clientName: this.userProfile?.fullName || 'Unknown User',
        neededService: this.selectedService,
        specificService: this.selectedSubService || '',
        scheduleDate: selectedDate,
        scheduleTime: scheduleTime, // Add separate time field for worker availability checking
        scheduledDateTime: selectedDate, // Keep full datetime for reference
        priceRange: this.maxBudget,
        minBudget: this.minBudget,
        maxBudget: this.maxBudget,
        additionalDetails: this.additionalDetails,
        status: 'searching',
        // Location information
        ...locationData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // Add automatic cleanup timeout (30 minutes from now)
        autoCleanupAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      console.log('📝 Creating booking with data:', bookingData);

      const docRef = await addDoc(
        collection(this.firestore, 'bookings'),
        bookingData
      );

      console.log('✅ Booking created with ID:', docRef.id);

      // Navigate to worker lookup with booking ID
      this.router.navigate(['/client/worker-lookup'], {
        queryParams: {
          bookingId: docRef.id,
          service: this.selectedService,
          date: this.selectedDateTime,
          minBudget: this.minBudget,
          maxBudget: this.maxBudget,
        },
      });
    } catch (error) {
      console.error('Error creating booking:', error);
      const toast = await this.toastController.create({
        message: 'Error creating booking. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    } finally {
      this.isLoading = false;
    }
  }
}
