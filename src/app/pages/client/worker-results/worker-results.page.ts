import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import {
  AlertController,
  LoadingController,
  ToastController,
} from '@ionic/angular';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  getDoc,
} from '@angular/fire/firestore';
import { AuthService } from '../../../services/auth.service';

interface ServicePrice {
  name: string;
  minPrice: number;
  maxPrice: number;
}

interface SubServicePrice {
  subServiceName: string;
  price: number;
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
  services: string[];
  priceRange: string;
  servicePrices?: ServicePrice[]; // Legacy pricing
  serviceWithPricing?: ServiceWithPricing[]; // New detailed pricing
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  phoneNumber: string;
  availabilityDays: string[];
  verificationStatus: string;
  distance?: number;
}

interface BookingData {
  id: string;
  clientId: string;
  neededService: string;
  specificService?: string;
  scheduleDate: any;
  priceRange: number;
  minBudget: number;
  maxBudget: number;
  status: string;
}

@Component({
  selector: 'app-worker-results',
  templateUrl: './worker-results.page.html',
  styleUrls: ['./worker-results.page.scss'],
  standalone: false,
})
export class WorkerResultsPage implements OnInit {
  workers: WorkerProfile[] = [];
  filteredWorkers: WorkerProfile[] = [];
  booking: BookingData | null = null;
  bookingId: string = '';
  isLoading = true;
  currentUser: any = null;

  // Filter options
  filters = {
    maxDistance: 50,
    minRating: 0,
    sortBy: 'distance', // 'distance', 'rating', 'price'
  };

  showFilters = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private firestore: Firestore,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();

    // Get booking ID from query params
    this.route.queryParams.subscribe(async (params) => {
      this.bookingId = params['bookingId'];
      if (this.bookingId) {
        await this.loadBookingData();
        await this.loadWorkers();
      }
    });
  }

  goBack() {
    this.router.navigate(['/client/book-service']);
  }

  async loadBookingData() {
    try {
      const bookingDoc = await getDoc(
        doc(this.firestore, 'bookings', this.bookingId)
      );
      if (bookingDoc.exists()) {
        this.booking = {
          id: bookingDoc.id,
          ...bookingDoc.data(),
        } as BookingData;
      }
    } catch (error) {
      console.error('Error loading booking data:', error);
    }
  }

  async loadWorkers() {
    try {
      this.isLoading = true;
      console.log('Starting to load workers...');
      console.log('Current booking data:', this.booking);

      // Query workers from workers collection (main source of professional data)
      const workersQuery = query(
        collection(this.firestore, 'workers'),
        where('status', '==', 'verified') // Only get verified workers
      );

      const workersSnapshot = await getDocs(workersQuery);
      console.log(
        `Found ${workersSnapshot.size} verified workers in workers collection`
      );

      this.workers = [];

      // Get user data map for personal information
      const usersQuery = query(collection(this.firestore, 'users'));
      const usersSnapshot = await getDocs(usersQuery);
      const userDataMap = new Map();
      usersSnapshot.forEach((doc) => {
        userDataMap.set(doc.id, doc.data());
      });

      workersSnapshot.forEach((doc) => {
        const workerData = doc.data();
        const userData = userDataMap.get(doc.id) || {};

        console.log('Processing worker:', doc.id);
        console.log('Worker data:', workerData);
        console.log('User data:', userData);

        // Check if worker matches the service needed and is available on the selected date
        if (this.booking) {
          const serviceMatch = this.workerMatchesService(workerData);
          const isAvailable = this.workerIsAvailable(workerData);
          const priceMatch = this.workerMatchesPrice(workerData);

          console.log(
            `Worker ${
              userData['fullName'] || workerData['fullName'] || 'Unknown'
            }:`
          );
          console.log('- Service match:', serviceMatch);
          console.log('- Available:', isAvailable);
          console.log('- Price match:', priceMatch);

          if (serviceMatch && isAvailable && priceMatch) {
            const worker: WorkerProfile = {
              uid: doc.id,
              fullName:
                userData['fullName'] ||
                workerData['fullName'] ||
                'Unknown Worker',
              photoUrl: this.getWorkerPhotoUrl(workerData, userData),
              rating: workerData['rating'] || 0,
              reviewCount: workerData['reviewCount'] || 0,
              skills: workerData['skills'] || [],
              services: this.extractServicesFromPrices(
                workerData['servicePrices'] || []
              ),
              priceRange: this.getPriceRangeForService(
                workerData['servicePrices'] || [],
                this.booking.neededService
              ),
              location: workerData['location'] || {
                latitude: 0,
                longitude: 0,
                address: 'Unknown',
              },
              phoneNumber:
                userData['phoneNumber'] ||
                userData['phone'] ||
                workerData['phoneNumber'] ||
                '',
              availabilityDays: workerData['availableDays'] || [],
              verificationStatus: workerData['status'] || 'pending',
            };

            // Calculate distance (mock calculation for now)
            worker.distance = this.calculateDistance(worker.location);

            console.log(`Adding worker ${worker.fullName} to results`);
            this.workers.push(worker);
          } else {
            console.log(
              `Worker ${userData['fullName'] || 'Unknown'} filtered out`
            );
          }
        }
      });

      console.log(`Final worker count: ${this.workers.length}`);
      this.applyFilters();
    } catch (error) {
      console.error('Error loading workers:', error);
      const toast = await this.toastController.create({
        message: 'Error loading workers. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    } finally {
      this.isLoading = false;
    }
  }

  workerMatchesService(workerData: any): boolean {
    if (!this.booking) return false;

    const neededService = this.booking.neededService.toLowerCase();
    const servicePrices = workerData['servicePrices'] || [];

    console.log(`Checking service match for "${neededService}"`);
    console.log('Worker service prices:', servicePrices);

    // Check if worker has the needed service in their servicePrices array
    const serviceMatch = servicePrices.some((servicePrice: any) => {
      const serviceName = (servicePrice.name || '').toLowerCase();
      return (
        neededService.includes(serviceName) ||
        serviceName.includes(neededService)
      );
    });

    // Also check skills as fallback
    const workerSkills = (workerData['skills'] || []).map((s: string) =>
      s.toLowerCase()
    );
    const skillMatch = workerSkills.some(
      (skill: string) =>
        neededService.includes(skill) || skill.includes(neededService)
    );

    console.log('Service match:', serviceMatch, 'Skill match:', skillMatch);
    return serviceMatch || skillMatch;
  }

  workerMatchesPrice(workerData: any): boolean {
    if (!this.booking) return false;

    const neededService = this.booking.neededService.toLowerCase();
    const userMinBudget = this.booking.minBudget || 0;
    const userMaxBudget =
      this.booking.maxBudget || this.booking.priceRange || Infinity;
    const servicePrices = workerData['servicePrices'] || [];

    console.log(`Checking price match for service "${neededService}"`);
    console.log(`User budget range: ₱${userMinBudget} - ₱${userMaxBudget}`);
    console.log('Worker service prices:', servicePrices);

    // Find the matching service in worker's servicePrices
    const matchingService = servicePrices.find((servicePrice: any) => {
      const serviceName = (servicePrice.name || '').toLowerCase();
      return (
        neededService.includes(serviceName) ||
        serviceName.includes(neededService)
      );
    });

    if (!matchingService) {
      console.log("No matching service found in worker's servicePrices");
      return true; // If no specific pricing, allow worker to show up
    }

    const workerMinPrice = matchingService.minPrice || 0;
    const workerMaxPrice = matchingService.maxPrice || Infinity;

    console.log(`Worker price range: ₱${workerMinPrice} - ₱${workerMaxPrice}`);

    // Check if there's any overlap between user budget and worker prices
    // User budget: userMinBudget to userMaxBudget
    // Worker price: workerMinPrice to workerMaxPrice
    const priceMatch =
      userMaxBudget >= workerMinPrice && userMinBudget <= workerMaxPrice;
    console.log('Price match (budget overlap):', priceMatch);

    return priceMatch;
  }

  /**
   * Get specific pricing for a worker's service/sub-service
   */
  getWorkerSpecificPrice(workerData: any): string {
    if (!this.booking) return 'Contact for pricing';

    const neededService = this.booking.neededService;
    const specificService = this.booking.specificService;

    // Check new detailed pricing first
    if (workerData.serviceWithPricing) {
      const categoryPricing = workerData.serviceWithPricing.find(
        (category: ServiceWithPricing) =>
          category.categoryName === neededService
      );

      if (categoryPricing && specificService) {
        const subServicePricing = categoryPricing.subServices.find(
          (sub: SubServicePrice) => sub.subServiceName === specificService
        );

        if (subServicePricing && subServicePricing.price > 0) {
          return `₱${subServicePricing.price.toLocaleString()}`;
        }
      }
    }

    // Fallback to legacy pricing (range)
    if (workerData.servicePrices) {
      const matchingService = workerData.servicePrices.find(
        (servicePrice: ServicePrice) => {
          return (
            servicePrice.name.toLowerCase() === neededService.toLowerCase()
          );
        }
      );

      if (matchingService) {
        if (matchingService.minPrice === matchingService.maxPrice) {
          return `₱${matchingService.minPrice.toLocaleString()}`;
        } else {
          return `₱${matchingService.minPrice.toLocaleString()} - ₱${matchingService.maxPrice.toLocaleString()}`;
        }
      }
    }

    return 'Contact for pricing';
  }

  /**
   * Check if worker has specific pricing for the requested service
   */
  hasSpecificPricing(workerData: any): boolean {
    if (!this.booking) return false;

    const neededService = this.booking.neededService;
    const specificService = this.booking.specificService;

    // Check new detailed pricing
    if (workerData.serviceWithPricing && specificService) {
      const categoryPricing = workerData.serviceWithPricing.find(
        (category: ServiceWithPricing) =>
          category.categoryName === neededService
      );

      if (categoryPricing) {
        const subServicePricing = categoryPricing.subServices.find(
          (sub: SubServicePrice) => sub.subServiceName === specificService
        );

        return subServicePricing && subServicePricing.price > 0;
      }
    }

    return false;
  }

  getWorkerPhotoUrl(workerData: any, userData: any): string {
    // Priority order for worker photos:
    // 1. Base64 profilePhotoData from workers collection (highest quality)
    // 2. profilePhotoUrl from workers collection
    // 3. photoUrl from users collection
    // 4. profilePicture from users collection
    // 5. Default avatar

    if (workerData['profilePhotoData']) {
      // Check if it's already a data URL, if not, make it one
      const base64Data = workerData['profilePhotoData'];
      if (base64Data.startsWith('data:image/')) {
        return base64Data;
      } else {
        // Assume it's a base64 string without the data URL prefix
        return `data:image/jpeg;base64,${base64Data}`;
      }
    }

    if (workerData['profilePhotoUrl']) {
      return workerData['profilePhotoUrl'];
    }

    if (userData['photoUrl']) {
      return userData['photoUrl'];
    }

    if (userData['profilePicture']) {
      return userData['profilePicture'];
    }

    return '/assets/default-avatar.png';
  }

  extractServicesFromPrices(servicePrices: any[]): string[] {
    return servicePrices.map(
      (servicePrice) => servicePrice.name || 'Unknown Service'
    );
  }

  getPriceRangeForService(servicePrices: any[], serviceName: string): string {
    const matchingService = servicePrices.find((servicePrice: any) => {
      const name = (servicePrice.name || '').toLowerCase();
      const needed = serviceName.toLowerCase();
      return needed.includes(name) || name.includes(needed);
    });

    if (matchingService) {
      return `₱${matchingService.minPrice || 0}-${
        matchingService.maxPrice || 1000
      }`;
    }

    return '₱500-1000'; // Default price range
  }

  workerIsAvailable(workerData: any): boolean {
    if (!this.booking) return false;

    const scheduleDate = new Date(this.booking.scheduleDate.toDate());
    const dayOfWeek = scheduleDate
      .toLocaleDateString('en-US', {
        weekday: 'long',
      })
      .toLowerCase(); // Convert to lowercase for comparison

    const availableDays = (workerData['availableDays'] || []).map(
      (day: string) => day.toLowerCase()
    );
    console.log(`Checking availability for ${dayOfWeek}`);
    console.log('Worker available days:', availableDays);

    const isAvailable = availableDays.includes(dayOfWeek);
    console.log('Is available:', isAvailable);

    return isAvailable;
  }

  isWorkerVerified(workerData: any): boolean {
    const status = workerData['verificationStatus'] || workerData['status'];
    return status === 'verified';
  }

  calculateDistance(workerLocation: any): number {
    // Mock distance calculation - in real app, use geolocation
    return Math.floor(Math.random() * 20) + 1; // Random distance between 1-20 km
  }

  applyFilters() {
    this.filteredWorkers = [...this.workers];

    // Filter by distance
    this.filteredWorkers = this.filteredWorkers.filter(
      (worker) => (worker.distance || 0) <= this.filters.maxDistance
    );

    // Filter by rating
    this.filteredWorkers = this.filteredWorkers.filter(
      (worker) => worker.rating >= this.filters.minRating
    );

    // Sort workers
    this.sortWorkers();
  }

  sortWorkers() {
    switch (this.filters.sortBy) {
      case 'distance':
        this.filteredWorkers.sort(
          (a, b) => (a.distance || 0) - (b.distance || 0)
        );
        break;
      case 'rating':
        this.filteredWorkers.sort((a, b) => b.rating - a.rating);
        break;
      case 'price':
        this.filteredWorkers.sort((a, b) =>
          a.priceRange.localeCompare(b.priceRange)
        );
        break;
    }
  }

  onFilterChange() {
    this.applyFilters();
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
  }

  async bookWorker(worker: WorkerProfile) {
    const alert = await this.alertController.create({
      header: 'Confirm Booking',
      message: `Are you sure you want to book ${worker.fullName} for this service?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Yes, Book Now',
          handler: async () => {
            await this.confirmBooking(worker);
          },
        },
      ],
    });

    await alert.present();
  }

  async confirmBooking(worker: WorkerProfile) {
    const loading = await this.loadingController.create({
      message: 'Booking worker...',
    });
    await loading.present();

    try {
      console.log('🔄 Updating booking with worker assignment:', {
        bookingId: this.bookingId,
        assignedWorker: worker.uid,
        workerId: worker.uid,
        workerName: worker.fullName,
        workerPhone: worker.phoneNumber,
        status: 'pending',
      });

      // Update booking with worker information
      await updateDoc(doc(this.firestore, 'bookings', this.bookingId), {
        assignedWorker: worker.uid,
        workerId: worker.uid,
        workerName: worker.fullName,
        workerPhone: worker.phoneNumber,
        status: 'pending',
        updatedAt: new Date(),
      });

      console.log('✅ Booking successfully updated with worker assignment');

      await loading.dismiss();

      const toast = await this.toastController.create({
        message: 'Booking request sent! Waiting for worker to accept.',
        duration: 3000,
        color: 'success',
      });
      toast.present();

      // Redirect to booking progress page
      this.router.navigate(['/client/booking-progress', this.bookingId]);
    } catch (error) {
      await loading.dismiss();
      console.error('Error booking worker:', error);

      const toast = await this.toastController.create({
        message: 'Error booking worker. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    }
  }

  getStarRating(rating: number): string[] {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(i <= rating ? 'star' : 'star-outline');
    }
    return stars;
  }
}
