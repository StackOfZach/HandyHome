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
  addDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import { AuthService } from '../../../services/auth.service';
import {
  DashboardService,
  ServiceCategory,
} from '../../../services/dashboard.service';
import {
  WorkerAvailabilityService,
  BookingConflictCheck,
} from '../../../services/worker-availability.service';

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
  timeAvailability?: { [key: string]: { startTime: string; endTime: string } }; // Time availability for each day
  workRadius?: number; // Worker's service radius in km
  verificationStatus: string;
  distance?: number;
}

interface BookingData {
  id: string;
  clientId: string;
  neededService: string;
  specificService?: string;
  scheduleDate: any;
  scheduleTime?: string; // Specific time for the booking
  estimatedDuration?: number; // Duration in hours
  priceRange: number;
  minBudget: number;
  maxBudget: number;
  coordinates?: { lat: number; lng: number }; // Client location coordinates
  address?: string; // Client address
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
  serviceCategories: ServiceCategory[] = []; // Add serviceCategories array

  // Filter options - DEFAULT: Sort by distance (nearby workers first)
  filters = {
    maxDistance: 100, // Reasonable distance filter now that we have proper location data
    minRating: 0,
    sortBy: 'distance', // 'distance', 'rating', 'price' - PRIORITIZE NEARBY WORKERS
  };

  showFilters = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private firestore: Firestore,
    private authService: AuthService,
    private dashboardService: DashboardService,
    private workerAvailabilityService: WorkerAvailabilityService
  ) {}

  async ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();

    // Load service categories first
    await this.loadServiceCategories();

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

  async loadServiceCategories() {
    try {
      this.serviceCategories =
        await this.dashboardService.getServiceCategories();
      console.log('Loaded service categories:', this.serviceCategories);
    } catch (error) {
      console.error('Error loading service categories:', error);
    }
  }

  /**
   * Calculate average rating for a worker from all their completed bookings
   */
  async calculateWorkerAverageRating(
    workerId: string
  ): Promise<{ averageRating: number; reviewCount: number }> {
    try {
      const ratings: number[] = [];

      // Get ratings from regular bookings collection
      const bookingsQuery = query(
        collection(this.firestore, 'bookings'),
        where('assignedWorker', '==', workerId),
        where('status', '==', 'completed')
      );
      const bookingsSnapshot = await getDocs(bookingsQuery);

      bookingsSnapshot.forEach((doc) => {
        const booking = doc.data();
        if (
          booking['rating'] &&
          typeof booking['rating'] === 'number' &&
          booking['rating'] > 0
        ) {
          ratings.push(booking['rating']);
        }
      });

      // Get ratings from quick bookings collection
      const quickBookingsQuery = query(
        collection(this.firestore, 'quickBookings'),
        where('assignedWorker', '==', workerId),
        where('status', '==', 'completed')
      );
      const quickBookingsSnapshot = await getDocs(quickBookingsQuery);

      quickBookingsSnapshot.forEach((doc) => {
        const booking = doc.data();
        if (
          booking['rating'] &&
          typeof booking['rating'] === 'number' &&
          booking['rating'] > 0
        ) {
          ratings.push(booking['rating']);
        }
      });

      console.log(`Worker ${workerId} ratings found:`, ratings);

      // Calculate average
      if (ratings.length === 0) {
        return { averageRating: 0, reviewCount: 0 };
      }

      const averageRating =
        ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
      return {
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
        reviewCount: ratings.length,
      };
    } catch (error) {
      console.error(`Error calculating rating for worker ${workerId}:`, error);
      return { averageRating: 0, reviewCount: 0 };
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

      // Process each worker with availability checks
      for (let i = 0; i < workersSnapshot.docs.length; i++) {
        const doc = workersSnapshot.docs[i];
        const workerData = doc.data();
        const userData = userDataMap.get(doc.id) || {};

        console.log('Processing worker:', doc.id);
        console.log('Worker data:', workerData);
        console.log('User data:', userData);

        // Check if worker matches the service needed and is available on the selected date
        if (this.booking) {
          const serviceMatch = this.workerMatchesService(workerData);
          const isAvailable = this.workerIsAvailable(workerData);
          const timeAvailable = this.workerIsAvailableAtTime(workerData);
          const priceMatch = this.workerMatchesPrice(workerData);
          const locationMatch = this.workerMatchesLocation(workerData);

          // NEW: Check actual booking conflicts (ignore online status for scheduled bookings)
          let bookingAvailable = true;
          if (this.booking.scheduleDate && this.booking.scheduleTime) {
            const dateString = this.workerAvailabilityService.parseScheduleDate(
              this.booking.scheduleDate
            );
            console.log(
              '🗓️ Parsed date string:',
              dateString,
              'from:',
              this.booking.scheduleDate
            );
            if (dateString) {
              const conflictCheck =
                await this.workerAvailabilityService.hasBookingConflicts(
                  doc.id,
                  dateString,
                  this.booking.scheduleTime,
                  1 // Assume 1 hour duration for now, could be made dynamic
                );
              bookingAvailable = !conflictCheck.hasConflict;
              console.log('🔍 Conflict check result:', conflictCheck);
            }
          } else {
            console.log('⚠️ No schedule date/time found:', {
              scheduleDate: this.booking.scheduleDate,
              scheduleTime: this.booking.scheduleTime,
            });
          }

          const workerName =
            userData['fullName'] || workerData['fullName'] || 'Unknown';
          console.log(`\n🔍 === WORKER EVALUATION: ${workerName} ===`);
          console.log('📋 Booking requirements:', {
            service: this.booking.neededService,
            subService: this.booking.specificService,
            date: this.booking.scheduleDate,
            time: this.booking.scheduleTime,
            budget: `₱${this.booking.minBudget}-₱${this.booking.maxBudget}`,
            location: this.booking.coordinates,
          });
          console.log('✅ Service match:', serviceMatch);
          console.log('📅 Day available:', isAvailable);
          console.log('⏰ Time available:', timeAvailable);
          console.log('🗓️ Booking available (no conflicts):', bookingAvailable);
          console.log('💰 Price match:', priceMatch);
          console.log('📍 Location match:', locationMatch);

          // Debug: Show which specific checks are failing
          if (!serviceMatch) console.log('❌ Service match failed');
          if (!isAvailable) console.log('❌ Day available failed');
          if (!timeAvailable) console.log('❌ Time available failed');
          if (!bookingAvailable) console.log('❌ Booking conflicts found');
          if (!priceMatch) console.log('❌ Price match failed');
          if (!locationMatch) console.log('❌ Location match failed');

          const passedChecks = [
            serviceMatch,
            isAvailable,
            timeAvailable,
            bookingAvailable,
            priceMatch,
            locationMatch,
          ].filter(Boolean).length;
          console.log(`🎯 RESULT: ${passedChecks}/6 checks passed`);

          // ✅ RELAXED MATCH: Make matching less strict temporarily for debugging
          const fullMatch =
            serviceMatch &&
            // isAvailable &&  // Temporarily disable day availability check
            // timeAvailable && // Temporarily disable time availability check
            bookingAvailable &&
            priceMatch;
          // locationMatch;   // Temporarily disable location match
          console.log(
            `🎯 FULL MATCH (relaxed criteria for debugging): ${fullMatch}`
          );

          if (fullMatch) {
            // Calculate actual rating from bookings
            const ratingData = await this.calculateWorkerAverageRating(doc.id);

            const worker: WorkerProfile = {
              uid: doc.id,
              fullName:
                userData['fullName'] ||
                workerData['fullName'] ||
                'Unknown Worker',
              photoUrl: this.getWorkerPhotoUrl(workerData, userData),
              rating: ratingData.averageRating,
              reviewCount: ratingData.reviewCount,
              skills: workerData['skills'] || [],
              services: this.extractServicesFromPrices(
                workerData['servicePrices'] || []
              ),
              priceRange: this.getWorkerSpecificPriceWithUnit(workerData),
              servicePrices: workerData['servicePrices'] || [], // Copy legacy pricing
              serviceWithPricing: workerData['serviceWithPricing'] || [], // Copy detailed pricing
              location: this.getWorkerLocation(workerData),
              phoneNumber:
                userData['phoneNumber'] ||
                userData['phone'] ||
                workerData['phoneNumber'] ||
                '',
              availabilityDays: workerData['availableDays'] || [],
              timeAvailability: workerData['timeAvailability'] || {},
              workRadius: workerData['workRadius'] || 10, // Default 10km radius
              verificationStatus: workerData['status'] || 'pending',
            };

            // Calculate real distance using coordinates
            worker.distance = this.calculateDistance(worker.location);

            console.log(`Adding worker ${worker.fullName} to results`);
            this.workers.push(worker);
          } else {
            console.log(
              `Worker ${userData['fullName'] || 'Unknown'} filtered out`
            );
          }
        }
      }

      console.log(`\n🏁 === FINAL RESULTS ===`);
      console.log(`📊 Total verified workers found: ${workersSnapshot.size}`);
      console.log(
        `✅ Workers that passed all criteria: ${this.workers.length}`
      );

      if (this.workers.length === 0) {
        console.log(`\n❌ NO WORKERS FOUND! Possible issues:`);
        console.log(
          `1. 🔍 Service matching too strict (check serviceWithPricing data)`
        );
        console.log(
          `2. 💰 Price matching too strict (check budget vs worker prices)`
        );
        console.log(
          `3. ⏰ Time availability too strict (check timeAvailability data)`
        );
        console.log(
          `4. 📍 Location matching too strict (check coordinates & workRadius)`
        );
        console.log(`5. 📅 Day availability issue (check availableDays)`);
        console.log(
          `\n🔧 Check the detailed logs above for each worker evaluation.`
        );
      }

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
    const specificService = this.booking.specificService?.toLowerCase() || '';

    console.log(`🔍 === SERVICE MATCHING DEBUG ===`);
    console.log(`🎯 Looking for: "${neededService}" | "${specificService}"`);
    console.log(
      `📋 Worker has serviceWithPricing:`,
      !!workerData['serviceWithPricing']
    );
    console.log(
      `📋 Worker serviceWithPricing data:`,
      workerData['serviceWithPricing']
    );

    // 1. PRIORITY: Check serviceWithPricing for exact sub-service match
    const serviceWithPricing = workerData['serviceWithPricing'] || [];
    if (serviceWithPricing.length > 0) {
      console.log('📋 Checking serviceWithPricing...');

      serviceWithPricing.forEach(
        (category: ServiceWithPricing, index: number) => {
          const categoryName = (category.categoryName || '').toLowerCase();
          console.log(`📂 Category ${index}: "${categoryName}"`);
          console.log(
            `📂 Sub-services:`,
            category.subServices?.map((s) => s.subServiceName)
          );

          const categoryMatches =
            neededService.includes(categoryName) ||
            categoryName.includes(neededService);
          console.log(
            `📂 Category matches "${neededService}": ${categoryMatches}`
          );

          if (categoryMatches && specificService) {
            category.subServices?.forEach((subService: SubServicePrice) => {
              const subServiceName = (
                subService.subServiceName || ''
              ).toLowerCase();
              const matches =
                specificService.includes(subServiceName) ||
                subServiceName.includes(specificService);
              console.log(
                `   🔸 "${subServiceName}" matches "${specificService}": ${matches}`
              );
            });
          }
        }
      );

      const exactMatch = serviceWithPricing.some(
        (category: ServiceWithPricing) => {
          const categoryName = (category.categoryName || '').toLowerCase();
          const categoryMatches =
            neededService.includes(categoryName) ||
            categoryName.includes(neededService);

          if (categoryMatches) {
            if (specificService) {
              // Check if worker offers the specific sub-service
              const subServiceMatch = category.subServices.some(
                (subService: SubServicePrice) => {
                  const subServiceName = (
                    subService.subServiceName || ''
                  ).toLowerCase();
                  return (
                    specificService.includes(subServiceName) ||
                    subServiceName.includes(specificService)
                  );
                }
              );
              return subServiceMatch;
            } else {
              // If no specific service, category match is enough
              return true;
            }
          }

          return false;
        }
      );

      if (exactMatch) {
        console.log('🎯 MATCH FOUND in serviceWithPricing');
        return true;
      } else {
        console.log('❌ No match in serviceWithPricing');
      }
    } else {
      console.log('❌ No serviceWithPricing data found');
    }

    // 2. Fallback: Check category-level match only
    if (serviceWithPricing.length > 0) {
      const categoryMatch = serviceWithPricing.some(
        (category: ServiceWithPricing) => {
          const categoryName = (category.categoryName || '').toLowerCase();
          return (
            neededService.includes(categoryName) ||
            categoryName.includes(neededService)
          );
        }
      );

      if (categoryMatch) {
        console.log('✅ Category-level match found in serviceWithPricing');
        return true;
      }
    }

    // 3. Legacy fallback: Check servicePrices array
    const servicePrices = workerData['servicePrices'] || [];
    const serviceMatch = servicePrices.some((servicePrice: any) => {
      const serviceName = (servicePrice.name || '').toLowerCase();
      return (
        neededService.includes(serviceName) ||
        serviceName.includes(neededService)
      );
    });

    // 4. Final fallback: Check skills
    const workerSkills = (workerData['skills'] || []).map((s: string) =>
      s.toLowerCase()
    );
    const skillMatch = workerSkills.some(
      (skill: string) =>
        neededService.includes(skill) || skill.includes(neededService)
    );

    console.log(
      'Legacy service match:',
      serviceMatch,
      'Skill match:',
      skillMatch
    );
    return serviceMatch || skillMatch;
  }

  workerMatchesPrice(workerData: any): boolean {
    if (!this.booking) return false;

    const neededService = this.booking.neededService.toLowerCase();
    const specificService = this.booking.specificService?.toLowerCase() || '';
    const userMinBudget = this.booking.minBudget || 0;
    const userMaxBudget =
      this.booking.maxBudget || this.booking.priceRange || Infinity;

    console.log(`💰 === PRICE MATCHING DEBUG ===`);
    console.log(`💵 Client budget: ₱${userMinBudget} - ₱${userMaxBudget}`);
    console.log(
      `🎯 Looking for pricing: "${neededService}" - "${specificService}"`
    );

    // 1. PRIORITY: Check serviceWithPricing for exact budget match
    const serviceWithPricing = workerData['serviceWithPricing'] || [];
    if (serviceWithPricing.length > 0) {
      console.log(
        `💼 Worker has ${serviceWithPricing.length} service categories with pricing`
      );

      const categoryPricing = serviceWithPricing.find(
        (category: ServiceWithPricing) => {
          const categoryName = (category.categoryName || '').toLowerCase();
          const matches =
            neededService.includes(categoryName) ||
            categoryName.includes(neededService);
          console.log(
            `💼 Category "${categoryName}" matches "${neededService}": ${matches}`
          );
          return matches;
        }
      );

      if (categoryPricing) {
        console.log(
          `💼 Found matching category: ${categoryPricing.categoryName}`
        );
        console.log(
          `💼 Sub-services in category:`,
          categoryPricing.subServices?.map(
            (s: SubServicePrice) => `${s.subServiceName}: ₱${s.price}`
          )
        );

        if (specificService) {
          const subServicePricing = categoryPricing.subServices.find(
            (sub: SubServicePrice) => {
              const subServiceName = (sub.subServiceName || '').toLowerCase();
              const matches =
                specificService.includes(subServiceName) ||
                subServiceName.includes(specificService);
              console.log(
                `   💰 "${subServiceName}" matches "${specificService}": ${matches} (Price: ₱${sub.price})`
              );
              return matches;
            }
          );

          if (subServicePricing && subServicePricing.price > 0) {
            const workerPrice = subServicePricing.price;

            console.log(
              `💲 Worker's ${specificService} price: ₱${workerPrice}`
            );

            // Check if worker's price falls within client's budget
            const priceMatch =
              workerPrice >= userMinBudget && workerPrice <= userMaxBudget;
            console.log(
              `🎯 Price within budget (₱${userMinBudget}-₱${userMaxBudget}): ${priceMatch}`
            );

            return priceMatch;
          } else {
            console.log(
              `❌ No pricing found for specific service "${specificService}"`
            );
          }
        } else {
          console.log(
            `❌ No specific pricing found for "${specificService}" in category`
          );
          return false; // If no specific service pricing, exclude worker for budget safety
        }
      } else {
        console.log(`❌ No matching category found for "${neededService}"`);
      }
    } else {
      console.log(`❌ Worker has no serviceWithPricing data`);
    }

    // 2. Fallback: Check legacy servicePrices array
    const servicePrices = workerData['servicePrices'] || [];
    const matchingService = servicePrices.find((servicePrice: any) => {
      const serviceName = (servicePrice.name || '').toLowerCase();
      return (
        neededService.includes(serviceName) ||
        serviceName.includes(neededService)
      );
    });

    if (!matchingService) {
      console.log(
        '🔍 No service-specific pricing found, checking if ANY pricing fits budget...'
      );

      // Final fallback: Check if worker has ANY pricing that fits the budget
      const allPrices: number[] = [];

      // Collect all prices from serviceWithPricing
      if (serviceWithPricing.length > 0) {
        serviceWithPricing.forEach((category: any) => {
          if (category.subServices) {
            category.subServices.forEach((sub: any) => {
              if (sub.price && sub.price > 0) {
                allPrices.push(sub.price);
              }
            });
          }
        });
      }

      // Collect all prices from legacy servicePrices
      if (servicePrices.length > 0) {
        servicePrices.forEach((service: any) => {
          if (service.minPrice && service.minPrice > 0) {
            allPrices.push(service.minPrice);
          }
          if (service.maxPrice && service.maxPrice > 0) {
            allPrices.push(service.maxPrice);
          }
        });
      }

      if (allPrices.length > 0) {
        const hasAffordablePrice = allPrices.some(
          (price) => price >= userMinBudget && price <= userMaxBudget
        );
        console.log(`💰 Worker's all prices: [${allPrices.join(', ')}]`);
        console.log(`💰 Any price in budget: ${hasAffordablePrice}`);
        return hasAffordablePrice;
      }

      console.log('❌ No pricing data found at all - EXCLUDING worker');
      return false; // If no pricing data at all, exclude worker
    }

    const workerMinPrice = matchingService.minPrice || 0;
    const workerMaxPrice = matchingService.maxPrice || Infinity;

    console.log(
      `💲 Worker price range: ₱${workerMinPrice} - ₱${workerMaxPrice}`
    );

    // Check if there's any overlap between user budget and worker prices
    const priceMatch =
      userMaxBudget >= workerMinPrice && userMinBudget <= workerMaxPrice;
    console.log('🎯 Price range overlap:', priceMatch);

    return priceMatch;
  }

  /**
   * Get specific pricing for a worker's service/sub-service WITH UNIT for worker cards
   * Format: "10/hr" or "800/day"
   */
  getWorkerSpecificPriceWithUnit(workerData: any): string {
    if (!this.booking) {
      console.log(`💰 No booking data available`);
      return 'Contact for pricing';
    }

    const neededService = this.booking.neededService;
    const specificService = this.booking.specificService;

    console.log(`💰 === GETTING PRICE WITH UNIT ===`);
    console.log(`💰 Looking for: ${neededService} - ${specificService}`);
    console.log(
      `💰 Worker has serviceWithPricing:`,
      !!workerData['serviceWithPricing']
    );

    // Check new detailed pricing first
    if (workerData['serviceWithPricing'] && specificService) {
      console.log(`💰 Checking serviceWithPricing...`);
      const categoryPricing = workerData['serviceWithPricing'].find(
        (category: ServiceWithPricing) =>
          category.categoryName === neededService
      );

      if (categoryPricing) {
        console.log(`💰 Found category: ${categoryPricing.categoryName}`);
        console.log(
          `💰 Sub-services:`,
          categoryPricing.subServices?.map(
            (s: SubServicePrice) => s.subServiceName
          )
        );

        const subServicePricing = categoryPricing.subServices.find(
          (sub: SubServicePrice) => sub.subServiceName === specificService
        );

        if (subServicePricing && subServicePricing.price > 0) {
          // Get the unit for this sub-service from serviceCategories
          const unit = this.getSubServiceUnitShort(
            neededService,
            specificService
          );
          console.log(
            `💰 Found specific pricing: ₱${subServicePricing.price}${unit}`
          );
          return `₱${subServicePricing.price}${unit}`;
        } else {
          console.log(
            `💰 No sub-service pricing found for: ${specificService}`
          );
          console.log(
            `💰 Available sub-services:`,
            categoryPricing.subServices?.map(
              (s: SubServicePrice) => `${s.subServiceName}: ₱${s.price}`
            )
          );
        }
      } else {
        console.log(`💰 No category pricing found for: ${neededService}`);
        console.log(
          `💰 Available categories:`,
          workerData['serviceWithPricing']?.map((c: any) => c.categoryName)
        );
      }
    } else {
      console.log(`💰 No serviceWithPricing or specificService missing`);
      console.log(`💰 specificService:`, specificService);
    }

    // Fallback to legacy pricing (range)
    if (workerData['servicePrices']) {
      console.log(`💰 Using legacy servicePrices fallback`);
      const matchingService = workerData['servicePrices'].find(
        (servicePrice: ServicePrice) => {
          return (
            servicePrice.name.toLowerCase() === neededService.toLowerCase()
          );
        }
      );

      if (matchingService) {
        if (matchingService.minPrice === matchingService.maxPrice) {
          return `₱${matchingService.minPrice}`;
        } else {
          return `₱${matchingService.minPrice}-${matchingService.maxPrice}`;
        }
      }
    }

    console.log(`💰 No pricing found, returning contact message`);
    return 'Contact for pricing';
  }

  /**
   * Get specific pricing for a worker's service/sub-service WITH UNIT
   */
  getWorkerSpecificPrice(workerData: any): string {
    if (!this.booking) return 'Contact for pricing';

    const neededService = this.booking.neededService;
    const specificService = this.booking.specificService;

    // Check new detailed pricing first
    if (workerData.serviceWithPricing && specificService) {
      const categoryPricing = workerData.serviceWithPricing.find(
        (category: ServiceWithPricing) =>
          category.categoryName === neededService
      );

      if (categoryPricing) {
        const subServicePricing = categoryPricing.subServices.find(
          (sub: SubServicePrice) => sub.subServiceName === specificService
        );

        if (subServicePricing && subServicePricing.price > 0) {
          // Get the unit for this sub-service
          const unit = this.getSubServiceUnit(neededService, specificService);
          return `₱${subServicePricing.price.toLocaleString()}${unit}`;
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
   * Get the unit (per hour/per day) for a specific sub-service from service categories
   */
  getSubServiceUnit(categoryName: string, subServiceName: string): string {
    const category = this.serviceCategories.find(
      (cat) => cat.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (category && category.services && category.servicesPricing) {
      const subServiceIndex = category.services.findIndex(
        (service) => service.toLowerCase() === subServiceName.toLowerCase()
      );

      if (subServiceIndex !== -1 && category.servicesPricing[subServiceIndex]) {
        const unit = category.servicesPricing[subServiceIndex];
        return unit === 'per_hour' ? '/hour' : unit === 'per_day' ? '/day' : '';
      }
    }

    return '/hour'; // Default fallback
  }

  /**
   * Get the short unit format for worker cards (/hr or /day)
   */
  getSubServiceUnitShort(categoryName: string, subServiceName: string): string {
    const category = this.serviceCategories.find(
      (cat) => cat.name.toLowerCase() === categoryName.toLowerCase()
    );

    console.log(`🏷️ Getting unit for: ${categoryName} - ${subServiceName}`);
    console.log(`🏷️ Found category:`, category?.name);

    if (category && category.services && category.servicesPricing) {
      const subServiceIndex = category.services.findIndex(
        (service) => service.toLowerCase() === subServiceName.toLowerCase()
      );

      console.log(`🏷️ Sub-service index: ${subServiceIndex}`);
      console.log(`🏷️ Services:`, category.services);
      console.log(`🏷️ Pricing units:`, category.servicesPricing);

      if (subServiceIndex !== -1 && category.servicesPricing[subServiceIndex]) {
        const unit = category.servicesPricing[subServiceIndex];
        const shortUnit =
          unit === 'per_hour' ? '/hr' : unit === 'per_day' ? '/day' : '/hr';
        console.log(`🏷️ Unit found: ${unit} → ${shortUnit}`);
        return shortUnit;
      }
    }

    console.log(`🏷️ No unit found, using default /hr`);
    return '/hr'; // Default fallback
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

  /**
   * Get worker location from currentLocation field in workers collection
   */
  getWorkerLocation(workerData: any): {
    latitude: number;
    longitude: number;
    address: string;
  } {
    console.log(`📍 Getting worker location from:`, {
      currentLocation: workerData['currentLocation'],
      location: workerData['location'],
      hasCurrentLocation: !!workerData['currentLocation'],
      hasLocation: !!workerData['location'],
    });

    // Priority order for worker location:
    // 1. currentLocation field (GeoPoint from Firebase)
    // 2. location field (legacy)
    // 3. Default location

    if (workerData['currentLocation']) {
      const currentLocation = workerData['currentLocation'];
      console.log(`✅ Using currentLocation:`, currentLocation);

      // Handle Firebase GeoPoint
      if (
        currentLocation.latitude !== undefined &&
        currentLocation.longitude !== undefined
      ) {
        return {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          address: workerData['address'] || 'Current Location',
        };
      }
    }

    // Fallback to legacy location field
    if (workerData['location']) {
      const location = workerData['location'];
      console.log(`⚠️ Using legacy location:`, location);

      if (location.latitude !== undefined && location.longitude !== undefined) {
        return {
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address || 'Unknown Location',
        };
      }
    }

    // Default location if no valid coordinates found
    console.log(`❌ No valid location found, using default`);
    return {
      latitude: 0,
      longitude: 0,
      address: 'Location not available',
    };
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

  /**
   * Check if worker is available at the specific booking time
   */
  workerIsAvailableAtTime(workerData: any): boolean {
    if (!this.booking) return true;

    // Get booking time - try scheduleTime first, then extract from scheduleDate
    let bookingTime: string;
    if (this.booking.scheduleTime) {
      bookingTime = this.booking.scheduleTime;
    } else if (this.booking.scheduleDate) {
      // Extract time from full datetime for backward compatibility
      const scheduleDate = new Date(this.booking.scheduleDate.toDate());
      bookingTime = scheduleDate.toTimeString().slice(0, 5); // Extract HH:MM format
    } else {
      console.log('No schedule time information available');
      return true; // If no time info, assume available
    }

    const scheduleDate = new Date(this.booking.scheduleDate.toDate());
    const dayOfWeek = scheduleDate
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase();

    const timeAvailability = workerData['timeAvailability'] || {};
    const dayAvailability = timeAvailability[dayOfWeek];

    if (
      !dayAvailability ||
      !dayAvailability.startTime ||
      !dayAvailability.endTime
    ) {
      console.log(
        `❌ No time availability set for ${dayOfWeek} for worker ${
          workerData.fullName || 'Unknown'
        }`
      );
      console.log(
        `⚠️ Worker will be EXCLUDED due to missing availability data`
      );
      return false; // If no specific time availability, exclude worker for safety
    }

    // Parse booking time and worker availability
    const workerStartTime = dayAvailability.startTime; // Format: "HH:MM"
    const workerEndTime = dayAvailability.endTime; // Format: "HH:MM"

    // Validate time formats
    if (
      !this.isValidTimeFormat(bookingTime) ||
      !this.isValidTimeFormat(workerStartTime) ||
      !this.isValidTimeFormat(workerEndTime)
    ) {
      console.warn(
        `❌ Invalid time format detected for worker ${
          workerData.fullName || 'Unknown'
        }:`
      );
      console.warn(`- Booking time: "${bookingTime}"`);
      console.warn(`- Worker start: "${workerStartTime}"`);
      console.warn(`- Worker end: "${workerEndTime}"`);
      console.warn(`⚠️ Worker will be EXCLUDED due to invalid time format`);
      return false; // Exclude workers with invalid time formats
    }

    // Convert times to minutes for easier comparison
    const bookingMinutes = this.timeToMinutes(bookingTime);
    const startMinutes = this.timeToMinutes(workerStartTime);
    const endMinutes = this.timeToMinutes(workerEndTime);

    // Handle overnight shifts (e.g., 22:00 - 06:00)
    let isTimeAvailable: boolean;
    if (endMinutes < startMinutes) {
      // Overnight shift: available if booking is after start OR before end
      isTimeAvailable =
        bookingMinutes >= startMinutes || bookingMinutes <= endMinutes;
    } else {
      // Normal shift: available if booking is between start and end
      isTimeAvailable =
        bookingMinutes >= startMinutes && bookingMinutes <= endMinutes;
    }

    console.log(
      `⏰ Time availability check for ${
        workerData.fullName || 'Unknown'
      } on ${dayOfWeek}:`
    );
    console.log(`- Booking time: ${bookingTime} (${bookingMinutes} min)`);
    console.log(
      `- Worker hours: ${workerStartTime} - ${workerEndTime} (${startMinutes} - ${endMinutes} min)`
    );
    console.log(
      `- Overnight shift: ${endMinutes < startMinutes ? 'Yes' : 'No'}`
    );
    console.log(`- Available: ${isTimeAvailable ? '✅ YES' : '❌ NO'}`);

    if (!isTimeAvailable) {
      console.log(
        `🚫 WORKER EXCLUDED: ${
          workerData.fullName || 'Unknown'
        } is NOT available at ${bookingTime} on ${dayOfWeek}`
      );
      console.log(
        `   Reason: Booking time ${bookingTime} is outside worker's hours ${workerStartTime}-${workerEndTime}`
      );
    }

    return isTimeAvailable;
  }

  /**
   * Check if worker's location and work radius covers the booking location
   */
  workerMatchesLocation(workerData: any): boolean {
    if (!this.booking || !this.booking.coordinates) {
      console.log('📍 No booking coordinates available');
      return true; // If no location data, assume location match
    }

    // Use the proper getWorkerLocation method
    const workerLocation = this.getWorkerLocation(workerData);
    const workRadius = workerData['workRadius'] || 10; // Default 10km radius

    if (
      !workerLocation ||
      workerLocation.latitude === 0 ||
      workerLocation.longitude === 0
    ) {
      console.log('📍 No valid worker location data available');
      return true; // If no worker location, assume location match
    }

    const distance = this.calculateRealDistance(
      this.booking.coordinates.lat,
      this.booking.coordinates.lng,
      workerLocation.latitude,
      workerLocation.longitude
    );

    const locationMatch = distance <= workRadius;

    console.log(`📍 === LOCATION MATCH CHECK ===`);
    console.log(
      `📍 Booking location: ${this.booking.coordinates.lat}, ${this.booking.coordinates.lng}`
    );
    console.log(
      `📍 Worker location: ${workerLocation.latitude}, ${workerLocation.longitude} (${workerLocation.address})`
    );
    console.log(`📍 Distance: ${distance.toFixed(2)}km`);
    console.log(`📍 Work radius: ${workRadius}km`);
    console.log(`📍 Location match: ${locationMatch}`);

    return locationMatch;
  }

  /**
   * Validate time format (HH:MM)
   */
  private isValidTimeFormat(timeString: string): boolean {
    if (!timeString || typeof timeString !== 'string') return false;
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(timeString);
  }

  /**
   * Convert time string (HH:MM) to minutes since midnight
   */
  private timeToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Format time string to 12-hour format with AM/PM
   */
  formatTime(timeString: string): string {
    if (!timeString || !this.isValidTimeFormat(timeString)) return timeString;

    const [hours, minutes] = timeString.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;

    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  /**
   * Get worker availability info for the booking day
   */
  getWorkerAvailabilityInfo(workerData: any): string {
    if (!this.booking || !this.booking.scheduleDate) return '';

    const scheduleDate = new Date(this.booking.scheduleDate.toDate());
    const dayOfWeek = scheduleDate
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase();

    const timeAvailability = workerData['timeAvailability'] || {};
    const dayAvailability = timeAvailability[dayOfWeek];

    if (
      !dayAvailability ||
      !dayAvailability.startTime ||
      !dayAvailability.endTime
    ) {
      return 'Availability not specified';
    }

    const startTime = this.formatTime(dayAvailability.startTime);
    const endTime = this.formatTime(dayAvailability.endTime);

    return `Available ${startTime} - ${endTime}`;
  }

  /**
   * Calculate real distance between two coordinates using Haversine formula
   */
  private calculateRealDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.degreesToRadians(lat2 - lat1);
    const dLng = this.degreesToRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.degreesToRadians(lat1)) *
        Math.cos(this.degreesToRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  /**
   * Convert degrees to radians
   */
  private degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  calculateDistance(workerLocation: {
    latitude: number;
    longitude: number;
    address: string;
  }): number {
    if (!this.booking || !this.booking.coordinates) {
      console.log(
        '📍 No booking coordinates for distance calculation, using mock distance'
      );
      return Math.floor(Math.random() * 20) + 1;
    }

    if (
      !workerLocation ||
      workerLocation.latitude === 0 ||
      workerLocation.longitude === 0
    ) {
      console.log(
        '📍 No valid worker location for distance calculation, using mock distance'
      );
      return Math.floor(Math.random() * 20) + 1;
    }

    const distance = this.calculateRealDistance(
      this.booking.coordinates.lat,
      this.booking.coordinates.lng,
      workerLocation.latitude,
      workerLocation.longitude
    );

    console.log(`📍 Calculated distance: ${distance.toFixed(2)}km`);
    return Math.round(distance); // Return whole number only
  }

  applyFilters() {
    console.log(`\n🔧 === APPLYING FILTERS ===`);
    console.log(`📊 Starting with ${this.workers.length} workers`);

    this.filteredWorkers = [...this.workers];

    // Filter by distance
    console.log(`📍 Distance filter: max ${this.filters.maxDistance}km`);
    const beforeDistanceFilter = this.filteredWorkers.length;
    this.filteredWorkers = this.filteredWorkers.filter((worker) => {
      const distance = worker.distance || 0;
      const passes = distance <= this.filters.maxDistance;
      console.log(
        `   ${worker.fullName}: ${distance}km <= ${this.filters.maxDistance}km = ${passes}`
      );
      return passes;
    });
    console.log(
      `📍 After distance filter: ${beforeDistanceFilter} → ${this.filteredWorkers.length}`
    );

    // Filter by rating - handle "New Worker" case
    console.log(`⭐ Rating filter: min ${this.filters.minRating}`);
    const beforeRatingFilter = this.filteredWorkers.length;
    this.filteredWorkers = this.filteredWorkers.filter((worker) => {
      const rating = worker.rating;

      // If minRating is 0, show all workers (including new workers)
      if (this.filters.minRating === 0) {
        console.log(
          `   ${worker.fullName}: All ratings accepted (including new workers)`
        );
        return true;
      }

      // If worker has 0 rating (new worker), exclude them from higher rating filters
      if (rating === 0) {
        console.log(
          `   ${worker.fullName}: New worker (0 rating) excluded from ${this.filters.minRating}+ filter`
        );
        return false;
      }

      // Normal rating filtering for workers with ratings
      const passes = rating >= this.filters.minRating;
      console.log(
        `   ${worker.fullName}: ${rating} >= ${this.filters.minRating} = ${passes}`
      );
      return passes;
    });
    console.log(
      `⭐ After rating filter: ${beforeRatingFilter} → ${this.filteredWorkers.length}`
    );

    // Sort workers
    this.sortWorkers();

    console.log(`🏁 Final filtered workers: ${this.filteredWorkers.length}`);
    console.log(
      `🏁 Workers in filteredWorkers:`,
      this.filteredWorkers.map((w) => w.fullName)
    );
  }

  sortWorkers() {
    switch (this.filters.sortBy) {
      case 'distance':
        // PRIORITY: Sort by distance (nearby workers first)
        this.filteredWorkers.sort(
          (a, b) => (a.distance || 0) - (b.distance || 0)
        );
        console.log('🏆 Workers sorted by distance (nearest first)');
        break;
      case 'rating':
        this.filteredWorkers.sort((a, b) => b.rating - a.rating);
        console.log('🏆 Workers sorted by rating (highest first)');
        break;
      case 'price':
        this.filteredWorkers.sort((a, b) =>
          a.priceRange.localeCompare(b.priceRange)
        );
        console.log('🏆 Workers sorted by price');
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
      // First, double-check worker availability and reserve the time slot
      if (this.booking) {
        // Verify worker is still available before proceeding
        const conflictCheck =
          await this.workerAvailabilityService.hasBookingConflicts(
            worker.uid,
            this.booking.scheduleDate.toDate().toISOString().split('T')[0], // Convert to YYYY-MM-DD format
            this.booking.scheduleTime || '09:00',
            this.booking.estimatedDuration || 2
          );

        if (conflictCheck.hasConflict) {
          throw new Error(
            'Worker is no longer available at this time slot - conflicting bookings detected'
          );
        }
        console.log('� Reserving worker time slot...');
        await this.workerAvailabilityService.bookWorkerTimeSlot(
          worker.uid,
          this.booking.scheduleDate.toDate(),
          this.booking.scheduleTime || '09:00', // Use booking time or default
          this.booking.estimatedDuration || 2, // Duration in hours
          this.bookingId
        );
        console.log('✅ Time slot reserved successfully');
      }

      console.log('�🔄 Updating booking with worker assignment:', {
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
        timeSlotReserved: true, // Track that time slot is reserved
        updatedAt: new Date(),
      });

      console.log('✅ Booking successfully updated with worker assignment');

      // Create a notification for the selected worker
      try {
        const notifRef = collection(
          this.firestore,
          `workers/${worker.uid}/notifications`
        );
        await addDoc(notifRef, {
          title: 'New Booking Request',
          message: `A client requested ${
            this.booking?.specificService ||
            this.booking?.neededService ||
            'a service'
          }. Tap to view.`,
          bookingId: this.bookingId,
          categoryId: '',
          categoryName: this.booking?.neededService || '',
          read: false,
          priority: 'urgent',
          type: 'job_request',
          createdAt: serverTimestamp(),
          bookingType: 'regular',
        });
      } catch (notifyErr) {
        console.error(
          'Error creating worker notification from worker-results:',
          notifyErr
        );
      }

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

      // If error occurred during time slot booking, show specific message
      if (error instanceof Error && error.message.includes('time slot')) {
        const toast = await this.toastController.create({
          message:
            'Worker is no longer available at this time. Please try another worker.',
          duration: 4000,
          color: 'warning',
        });
        toast.present();

        // Refresh the worker list to show updated availability
        await this.loadWorkers();
      } else {
        const toast = await this.toastController.create({
          message: 'Error booking worker. Please try again.',
          duration: 3000,
          color: 'danger',
        });
        toast.present();
      }
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
