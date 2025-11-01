import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { WorkerService, WorkerProfile } from '../../../services/worker.service';
import { BookingService, BookingData } from '../../../services/booking.service';
import { QuickBookingService } from '../../../services/quick-booking.service';
import { DashboardService } from '../../../services/dashboard.service';
import {
  NotificationService,
  WorkerNotification,
} from '../../../services/notification.service';
import {
  JobManagementService,
  JobData,
} from '../../../services/job-management.service';
import {
  LocationTrackingService,
  LocationTrackingStatus,
  LocationData,
} from '../../../services/location-tracking.service';
import { WorkerAvailabilityService } from '../../../services/worker-availability.service';
import {
  AlertController,
  ToastController,
  ModalController,
} from '@ionic/angular';
import { JobDetailsModalComponent } from '../../../components/job-details-modal/job-details-modal.component';
import { Subscription, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  onSnapshot,
  orderBy,
  Timestamp,
} from '@angular/fire/firestore';

interface WorkerStats {
  jobsCompleted: number;
  averageRating: number;
  totalEarnings: number;
}

interface BookingSlide {
  title: string;
  description: string;
  stats: SlideStats[];
  progress: number;
  progressText: string;
  progressColor: string;
}

interface SlideStats {
  value: string | number;
  label: string;
  colorClass: string;
  textColor: string;
  labelColor: string;
}

interface QuickBookingNotification {
  id: string;
  title: string;
  message: string;
  bookingId: string;
  categoryName: string;
  subService: string;
  clientLocation: string;
  pricing: {
    basePrice: number;
    platformFee: number;
    transportationFee: number;
    total: number;
    workerEarning: number;
  };
  clientDetails: {
    name: string;
    phone?: string;
  };
  timestamp: Date;
}

@Component({
  selector: 'app-worker-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class WorkerDashboardPage implements OnInit, OnDestroy {
  userProfile: UserProfile | null = null;
  workerProfile: WorkerProfile | null = null;
  isAvailable: boolean = true;

  // Worker availability management
  isOnline: boolean = true;
  isAvailableForQuickBookings: boolean = true;

  // Notification data
  notifications: (WorkerNotification & { bookingType?: string })[] = [];
  unreadCount: number = 0;
  showNotifications: boolean = false; // Keep for backward compatibility
  showNotificationModal: boolean = false;

  // Quick booking notification system
  quickBookingNotification: QuickBookingNotification | null = null;
  showQuickNotification: boolean = false;

  // Job data
  availableJobs: JobData[] = [];
  ongoingJobs: JobData[] = [];

  // Track if worker has active job (prevents accepting new jobs)
  hasActiveJob: boolean = false;

  // Available bookings from quickbookings collection
  availableBookings: any[] = [];

  // Slideshow data
  bookingsSlides: BookingSlide[] = [];
  currentSlideIndex: number = 0;
  lastRefreshTime: Date = new Date();

  // Stats
  workerStats: WorkerStats = {
    jobsCompleted: 0,
    averageRating: 0,
    totalEarnings: 0,
  };

  // Location tracking
  locationTrackingStatus: LocationTrackingStatus = {
    isTracking: false,
    isPermissionGranted: false,
  };
  currentLocation: LocationData | null = null;

  private subscriptions: Subscription[] = [];
  private slideInterval: any;
  private statsListenersSetup = false;
  private lastQuickBookingIds = new Set<string>();

  constructor(
    private router: Router,
    private authService: AuthService,
    private workerService: WorkerService,
    private bookingService: BookingService,
    private quickBookingService: QuickBookingService,
    private dashboardService: DashboardService,
    private firestore: Firestore,
    private notificationService: NotificationService,
    private jobManagementService: JobManagementService,
    private locationTrackingService: LocationTrackingService,
    private alertController: AlertController,
    private toastController: ToastController,
    private modalController: ModalController,
    private workerAvailabilityService: WorkerAvailabilityService
  ) {}

  async ngOnInit() {
    // Subscribe to user profile
    this.subscriptions.push(
      this.authService.userProfile$.subscribe(async (profile) => {
        this.userProfile = profile;
        if (profile) {
          // Ensure workerProfile is loaded before setting listeners dependent on it
          await this.loadWorkerData();
          await this.loadWorkerAvailabilityStatus();
          this.setupNotificationListeners();
          this.setupJobListeners();
          this.setupLocationTracking();
          this.setupQuickBookingMonitoring();
          this.initializeSlideshow();
          this.loadAvailableBookings();
        }
      })
    );
  }

  ngOnDestroy() {
    // Stop location tracking
    this.locationTrackingService.stopTracking();

    // Clear slide interval
    if (this.slideInterval) {
      clearInterval(this.slideInterval);
    }

    // Clean up modal event listeners and restore body scroll
    if (this.showNotificationModal) {
      document.removeEventListener('keydown', this.handleModalKeydown);
      document.body.style.overflow = '';
    }

    // Unsubscribe from all subscriptions
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  async loadWorkerData() {
    if (!this.userProfile?.uid) return;

    try {
      // Load worker profile
      this.workerProfile = await this.workerService.getWorkerProfile(
        this.userProfile.uid
      );

      // Load worker stats
      await this.loadWorkerStats();
    } catch (error) {
      console.error('Error loading worker data:', error);
      this.showToast('Error loading dashboard data', 'danger');
    }
  }

  private setupLocationTracking() {
    if (!this.userProfile?.uid) return;

    // Subscribe to location tracking status
    this.subscriptions.push(
      this.locationTrackingService.getTrackingStatus().subscribe((status) => {
        this.locationTrackingStatus = status;

        // Show error toast if location tracking fails
        if (
          status.error &&
          status.error !== this.locationTrackingStatus.error
        ) {
          this.showToast(`Location tracking: ${status.error}`, 'danger');
        }
      })
    );

    // Subscribe to current location
    this.subscriptions.push(
      this.locationTrackingService
        .getCurrentLocation()
        .subscribe((location) => {
          this.currentLocation = location;
        })
    );

    // Start location tracking if worker is available
    if (this.isAvailable) {
      this.startLocationTracking();
    }
  }

  private async startLocationTracking() {
    if (!this.userProfile?.uid) return;

    try {
      await this.locationTrackingService.startTracking(this.userProfile.uid);
    } catch (error) {
      console.error('Failed to start location tracking:', error);
    }
  }

  private stopLocationTracking() {
    this.locationTrackingService.stopTracking();
  }

  private setupNotificationListeners() {
    // Subscribe to notifications
    this.subscriptions.push(
      this.notificationService.getNotifications().subscribe((notifications) => {
        this.notifications = notifications;
      })
    );

    // Subscribe to unread count
    this.subscriptions.push(
      this.notificationService.getUnreadCount().subscribe((count) => {
        this.unreadCount = count;

        // Show toast for new urgent notifications
        if (count > 0) {
          const urgentNotifications = this.notifications.filter(
            (n) =>
              !n.read && n.priority === 'urgent' && n.type === 'job_request'
          );

          if (urgentNotifications.length > 0) {
            this.showNewJobToast(urgentNotifications[0]);
          }
        }
      })
    );
  }

  private setupJobListeners() {
    // Subscribe to available jobs
    this.subscriptions.push(
      this.jobManagementService.getAvailableJobs().subscribe((jobs) => {
        this.availableJobs = jobs;
      })
    );

    // Subscribe to ongoing jobs
    this.subscriptions.push(
      this.jobManagementService.getOngoingJobs().subscribe((jobs) => {
        this.ongoingJobs = jobs;
        // Update hasActiveJob flag - worker cannot accept new jobs if they have 1 or more active jobs
        this.hasActiveJob = jobs.length >= 1;
      })
    );
  }

  private setupQuickBookingMonitoring() {
    if (!this.userProfile?.uid) return;

    // Monitor quick bookings for new opportunities
    this.subscriptions.push(
      this.dashboardService
        .loadActiveQuickBookings(this.userProfile.uid)
        .subscribe(async (quickBookings) => {
          // Only show notifications if worker is online and available for quick bookings
          if (!this.isOnline || !this.isAvailableForQuickBookings) {
            console.log('Worker is offline or unavailable for quick bookings');
            return;
          }

          // Check for new quick bookings that need worker assignment
          const availableQuickBookings = quickBookings.filter(
            (booking) => booking.status === 'pending'
          );

          if (availableQuickBookings.length > 0) {
            const latestBooking = availableQuickBookings[0];
            
            // Check if worker has availability for today (quick bookings are usually immediate)
            const hasAvailability = await this.checkTodayAvailability();
            if (hasAvailability) {
              this.showQuickBookingNotification(latestBooking);
            } else {
              console.log('Worker has conflicting bookings, not showing quick booking notification');
            }
          }
        })
    );

    // Also set up real-time monitoring for the available bookings list
    // This ensures the list is always up-to-date without manual refresh
    this.loadAvailableBookings();
  }

  private showQuickBookingNotification(booking: any) {
    if (this.quickBookingNotification?.id === booking.id) {
      return; // Already showing this notification
    }

    // Calculate pricing breakdown
    const basePrice = booking.pricing?.basePrice || 0;
    const platformFee = booking.pricing?.serviceCharge || 0;
    const transportationFee = 50; // Fixed transportation fee
    const total =
      booking.pricing?.total || basePrice + platformFee + transportationFee;
    const workerEarning = basePrice + transportationFee; // Worker gets base price + transportation, platform keeps the fee

    this.quickBookingNotification = {
      id: booking.id,
      title: 'Quick Booking Alert!',
      message: `${booking.subService || booking.categoryName} needed at ${
        booking.location?.address || 'Unknown location'
      }`,
      bookingId: booking.id,
      categoryName: booking.categoryName,
      subService: booking.subService,
      clientLocation: booking.location?.address || 'Unknown location',
      pricing: {
        basePrice,
        platformFee,
        transportationFee,
        total,
        workerEarning,
      },
      clientDetails: {
        name: booking.clientName || 'Client',
        phone: booking.clientPhone,
      },
      timestamp: new Date(),
    };

    this.showQuickNotification = true;

    // Auto-hide after 15 seconds if not interacted with
    setTimeout(() => {
      if (this.quickBookingNotification?.id === booking.id) {
        this.dismissQuickNotification();
      }
    }, 15000);
  }

  private initializeSlideshow() {
    this.generateBookingSlides();

    // Auto-advance slides every 5 seconds
    this.slideInterval = setInterval(() => {
      this.nextSlide();
    }, 5000);
  }

  private generateBookingSlides() {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Slide 1: This Month
    this.bookingsSlides = [
      {
        title: 'This Month Performance',
        description: `${currentDate.toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
        })}`,
        stats: [
          {
            value: this.workerStats.jobsCompleted || 0,
            label: 'Jobs Done',
            colorClass: 'from-blue-50 to-blue-100 border-blue-200',
            textColor: 'text-blue-700',
            labelColor: 'text-blue-600',
          },
          {
            value: this.workerStats.averageRating
              ? this.workerStats.averageRating.toFixed(1)
              : '0.0',
            label: 'Avg Rating',
            colorClass: 'from-yellow-50 to-yellow-100 border-yellow-200',
            textColor: 'text-yellow-700',
            labelColor: 'text-yellow-600',
          },
          {
            value: this.availableJobs.length || 0,
            label: 'Available',
            colorClass: 'from-purple-50 to-purple-100 border-purple-200',
            textColor: 'text-purple-700',
            labelColor: 'text-purple-600',
          },
          {
            value: this.ongoingJobs.length || 0,
            label: 'Active Jobs',
            colorClass: 'from-orange-50 to-orange-100 border-orange-200',
            textColor: 'text-orange-700',
            labelColor: 'text-orange-600',
          },
        ],
        progress: Math.min((this.workerStats.jobsCompleted / 10) * 100, 100),
        progressText: `${this.workerStats.jobsCompleted}/10 jobs this month`,
        progressColor: 'bg-gradient-to-r from-blue-500 to-green-500',
      },
      {
        title: 'Weekly Summary',
        description: 'Last 7 days performance',
        stats: [
          {
            value: Math.floor((this.workerStats.jobsCompleted || 0) / 4),
            label: 'Weekly Jobs',
            colorClass: 'from-indigo-50 to-indigo-100 border-indigo-200',
            textColor: 'text-indigo-700',
            labelColor: 'text-indigo-600',
          },
          {
            value: this.workerStats.averageRating
              ? this.workerStats.averageRating.toFixed(1)
              : '0.0',
            label: 'Rating',
            colorClass: 'from-emerald-50 to-emerald-100 border-emerald-200',
            textColor: 'text-emerald-700',
            labelColor: 'text-emerald-600',
          },
          {
            value: this.ongoingJobs.length || 0,
            label: 'Active Jobs',
            colorClass: 'from-orange-50 to-orange-100 border-orange-200',
            textColor: 'text-orange-700',
            labelColor: 'text-orange-600',
          },
          {
            value: this.isAvailable ? 'Online' : 'Offline',
            label: 'Status',
            colorClass: this.isAvailable
              ? 'from-green-50 to-green-100 border-green-200'
              : 'from-red-50 to-red-100 border-red-200',
            textColor: this.isAvailable ? 'text-green-700' : 'text-red-700',
            labelColor: this.isAvailable ? 'text-green-600' : 'text-red-600',
          },
        ],
        progress: Math.min((this.workerStats.jobsCompleted / 4 / 5) * 100, 100),
        progressText: `${Math.floor(
          (this.workerStats.jobsCompleted || 0) / 4
        )}/5 weekly target`,
        progressColor: 'bg-gradient-to-r from-indigo-500 to-purple-500',
      },
      {
        title: 'Total Career Stats',
        description: 'All-time performance',
        stats: [
          {
            value: this.workerProfile?.jobsCompleted || 0,
            label: 'Total Jobs',
            colorClass: 'from-cyan-50 to-cyan-100 border-cyan-200',
            textColor: 'text-cyan-700',
            labelColor: 'text-cyan-600',
          },
          {
            value: `₱${this.workerStats.totalEarnings || 0}`,
            label: 'Total Earned',
            colorClass: 'from-teal-50 to-teal-100 border-teal-200',
            textColor: 'text-teal-700',
            labelColor: 'text-teal-600',
          },
          {
            value: this.workerProfile?.rating || 0,
            label: 'Reviews',
            colorClass: 'from-pink-50 to-pink-100 border-pink-200',
            textColor: 'text-pink-700',
            labelColor: 'text-pink-600',
          },
          {
            value: 3, // Static value for now
            label: 'Services',
            colorClass: 'from-violet-50 to-violet-100 border-violet-200',
            textColor: 'text-violet-700',
            labelColor: 'text-violet-600',
          },
        ],
        progress: Math.min(
          ((this.workerProfile?.jobsCompleted || 0) / 100) * 100,
          100
        ),
        progressText: `${
          this.workerProfile?.jobsCompleted || 0
        }/100 career milestone`,
        progressColor: 'bg-gradient-to-r from-cyan-500 to-teal-500',
      },
    ];
  }

  private async showNewJobToast(notification: WorkerNotification) {
    const toast = await this.toastController.create({
      header: notification.title,
      message: notification.message,
      duration: 5000,
      color: 'primary',
      position: 'top',
      buttons: [
        // {
        //   text: 'View',
        //   handler: () => {
        //     this.openJobDetailsModal(notification.bookingId, notification.id!);
        //   },
        // },
        {
          text: 'Dismiss',
          role: 'cancel',
        },
      ],
    });
    await toast.present();
  }

  async loadWorkerStats() {
    if (!this.userProfile?.uid || !this.workerProfile) return;

    try {
      console.log('Loading worker stats from database...');

      // Fetch completed jobs from both quickbookings and bookings collections
      const [quickBookingStats, regularBookingStats] = await Promise.all([
        this.getQuickBookingStats(),
        this.getRegularBookingStats(),
      ]);

      // Combine stats from both collections
      const totalJobsCompleted =
        quickBookingStats.jobsCompleted + regularBookingStats.jobsCompleted;
      const totalRatings =
        quickBookingStats.totalRating + regularBookingStats.totalRating;
      const totalRatingCount =
        quickBookingStats.ratingCount + regularBookingStats.ratingCount;
      const averageRating =
        totalRatingCount > 0 ? totalRatings / totalRatingCount : 0;

      console.log('📊 Combined Stats Calculation:');
      console.log('- Quick bookings:', quickBookingStats);
      console.log('- Regular bookings:', regularBookingStats);
      console.log('- Total jobs completed:', totalJobsCompleted);
      console.log('- Total ratings:', totalRatings);
      console.log('- Total rating count:', totalRatingCount);
      console.log('- Calculated average rating:', averageRating);

      this.workerStats = {
        jobsCompleted: totalJobsCompleted,
        averageRating: averageRating,
        totalEarnings: this.workerProfile.totalEarnings || 0,
      };

      console.log('✅ Final worker stats loaded:', this.workerStats);

      // Force UI update
      this.generateBookingSlides();

      // Ensure real-time stats listeners are set up (one-time)
      if (!this.statsListenersSetup) {
        this.setupStatsRealtimeListeners();
      }
    } catch (error) {
      console.error('Error loading worker stats:', error);
      // Fallback to profile data
      this.workerStats = {
        jobsCompleted: this.workerProfile.jobsCompleted || 0,
        averageRating: this.workerProfile.rating || 0,
        totalEarnings: this.workerProfile.totalEarnings || 0,
      };
    }
  }

  private setupStatsRealtimeListeners() {
    if (this.statsListenersSetup || !this.userProfile?.uid) return;

    try {
      const quickBookingsRef = collection(this.firestore, 'quickbookings');
      const regularBookingsRef = collection(this.firestore, 'bookings');

      const quickQ = query(
        quickBookingsRef,
        where('assignedWorker', '==', this.userProfile.uid),
        where('status', 'in', ['completed', 'payment-confirmed'])
      );
      const regularQ = query(
        regularBookingsRef,
        where('assignedWorker', '==', this.userProfile.uid),
        where('status', 'in', ['completed', 'payment-confirmed'])
      );

      let latestQuickSnapshot: any[] = [];
      let latestRegularSnapshot: any[] = [];

      const recompute = () => {
        // Combine both snapshots to compute stats
        let jobsCompleted = 0;
        let totalRating = 0;
        let ratingCount = 0;

        const accumulate = (docs: any[]) => {
          docs.forEach((d) => {
            const data = d.data();
            jobsCompleted++;
            let rating: number | null = null;
            if (typeof data['rating'] === 'number') rating = data['rating'];
            else if (typeof data['clientRating'] === 'number')
              rating = data['clientRating'];
            else if (typeof data['workerRating'] === 'number')
              rating = data['workerRating'];
            else if (
              data['feedback'] &&
              typeof data['feedback']['rating'] === 'number'
            ) {
              rating = data['feedback']['rating'];
            }
            if (rating && rating > 0 && rating <= 5) {
              totalRating += rating;
              ratingCount++;
            }
          });
        };

        accumulate(latestQuickSnapshot);
        accumulate(latestRegularSnapshot);

        const averageRating = ratingCount > 0 ? totalRating / ratingCount : 0;

        this.workerStats = {
          jobsCompleted,
          averageRating,
          totalEarnings: this.workerProfile?.totalEarnings || 0,
        };
      };

      const unsubQuick = onSnapshot(quickQ, (snap) => {
        latestQuickSnapshot = snap.docs;
        recompute();
      });
      const unsubRegular = onSnapshot(regularQ, (snap) => {
        latestRegularSnapshot = snap.docs;
        recompute();
      });

      // Track unsubscribers
      this.subscriptions.push({ unsubscribe: unsubQuick } as any);
      this.subscriptions.push({ unsubscribe: unsubRegular } as any);
      this.statsListenersSetup = true;
    } catch (err) {
      console.error('Error setting up real-time stats listeners:', err);
    }
  }

  private async getQuickBookingStats(): Promise<{
    jobsCompleted: number;
    totalRating: number;
    ratingCount: number;
  }> {
    if (!this.userProfile?.uid)
      return { jobsCompleted: 0, totalRating: 0, ratingCount: 0 };

    try {
      const quickBookingsRef = collection(this.firestore, 'quickbookings');
      const q = query(
        quickBookingsRef,
        where('assignedWorker', '==', this.userProfile.uid),
        where('status', 'in', ['completed', 'payment-confirmed'])
      );

      const querySnapshot = await getDocs(q);
      let jobsCompleted = 0;
      let totalRating = 0;
      let ratingCount = 0;

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        jobsCompleted++;

        console.log('Quick booking data:', {
          id: doc.id,
          status: data['status'],
          rating: data['rating'],
          clientRating: data['clientRating'],
          workerRating: data['workerRating'],
          feedback: data['feedback'],
        });

        // Check for rating in multiple possible fields
        let rating = null;
        if (data['rating'] && typeof data['rating'] === 'number') {
          rating = data['rating'];
        } else if (
          data['clientRating'] &&
          typeof data['clientRating'] === 'number'
        ) {
          rating = data['clientRating'];
        } else if (
          data['workerRating'] &&
          typeof data['workerRating'] === 'number'
        ) {
          rating = data['workerRating'];
        } else if (
          data['feedback'] &&
          data['feedback']['rating'] &&
          typeof data['feedback']['rating'] === 'number'
        ) {
          rating = data['feedback']['rating'];
        }

        if (rating && rating > 0 && rating <= 5) {
          totalRating += rating;
          ratingCount++;
          console.log(`Found rating: ${rating} for booking ${doc.id}`);
        }
      });

      console.log(
        `Quick bookings stats: ${jobsCompleted} jobs, ${ratingCount} ratings, avg rating: ${
          ratingCount > 0 ? (totalRating / ratingCount).toFixed(2) : 0
        }`
      );
      return { jobsCompleted, totalRating, ratingCount };
    } catch (error) {
      console.error('Error fetching quick booking stats:', error);
      return { jobsCompleted: 0, totalRating: 0, ratingCount: 0 };
    }
  }

  private async getRegularBookingStats(): Promise<{
    jobsCompleted: number;
    totalRating: number;
    ratingCount: number;
  }> {
    if (!this.userProfile?.uid)
      return { jobsCompleted: 0, totalRating: 0, ratingCount: 0 };

    try {
      const bookingsRef = collection(this.firestore, 'bookings');
      const q = query(
        bookingsRef,
        where('assignedWorker', '==', this.userProfile.uid),
        where('status', 'in', ['completed', 'payment-confirmed'])
      );

      const querySnapshot = await getDocs(q);
      let jobsCompleted = 0;
      let totalRating = 0;
      let ratingCount = 0;

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        jobsCompleted++;

        console.log('Regular booking data:', {
          id: doc.id,
          status: data['status'],
          rating: data['rating'],
          clientRating: data['clientRating'],
          workerRating: data['workerRating'],
          feedback: data['feedback'],
        });

        // Check for rating in multiple possible fields
        let rating = null;
        if (data['rating'] && typeof data['rating'] === 'number') {
          rating = data['rating'];
        } else if (
          data['clientRating'] &&
          typeof data['clientRating'] === 'number'
        ) {
          rating = data['clientRating'];
        } else if (
          data['workerRating'] &&
          typeof data['workerRating'] === 'number'
        ) {
          rating = data['workerRating'];
        } else if (
          data['feedback'] &&
          data['feedback']['rating'] &&
          typeof data['feedback']['rating'] === 'number'
        ) {
          rating = data['feedback']['rating'];
        }

        if (rating && rating > 0 && rating <= 5) {
          totalRating += rating;
          ratingCount++;
          console.log(`Found rating: ${rating} for booking ${doc.id}`);
        }
      });

      console.log(
        `Regular bookings stats: ${jobsCompleted} jobs, ${ratingCount} ratings, avg rating: ${
          ratingCount > 0 ? (totalRating / ratingCount).toFixed(2) : 0
        }`
      );
      return { jobsCompleted, totalRating, ratingCount };
    } catch (error) {
      console.error('Error fetching regular booking stats:', error);
      return { jobsCompleted: 0, totalRating: 0, ratingCount: 0 };
    }
  }

  // Notification Management
  toggleNotifications() {
    this.showNotifications = !this.showNotifications;
  }

  openNotificationModal() {
    this.showNotificationModal = true;

    // Add keyboard event listener for escape key
    document.addEventListener('keydown', this.handleModalKeydown);

    // Prevent body scrolling when modal is open
    document.body.style.overflow = 'hidden';

    // Auto-mark notifications as read when modal opens (delayed to allow user to see them first)
    setTimeout(() => {
      if (this.unreadCount > 0) {
        this.markAllNotificationsRead();
      }
    }, 2000);
  }

  closeNotificationModal(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.showNotificationModal = false;

    // Remove keyboard event listener
    document.removeEventListener('keydown', this.handleModalKeydown);

    // Restore body scrolling
    document.body.style.overflow = '';
  }

  private handleModalKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      this.closeNotificationModal();
    }
  };

  async clearAllNotifications() {
    const alert = await this.alertController.create({
      header: 'Clear All Notifications',
      message:
        'Are you sure you want to clear all notifications? This action cannot be undone.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Clear All',
          role: 'destructive',
          handler: async () => {
            try {
              // Delete all notifications from Firestore
              await this.notificationService.clearAllNotifications();

              // Local state will be cleared by service's subject update, but ensure immediate UI update
              this.notifications = [];
              this.unreadCount = 0;

              this.showToast('All notifications cleared', 'success');
            } catch (error) {
              console.error('Error clearing notifications:', error);
              this.showToast('Error clearing notifications', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  getNotificationIcon(type: string): string {
    switch (type) {
      case 'job_request':
        return 'briefcase';
      case 'job_completed':
        return 'checkmark-circle';
      case 'payment':
        return 'card';
      case 'rating':
        return 'star';
      case 'system':
        return 'information-circle';
      default:
        return 'notifications';
    }
  }

  getNotificationIconClass(type: string): string {
    switch (type) {
      case 'job_request':
        return 'bg-orange-100';
      case 'job_completed':
        return 'bg-green-100';
      case 'payment':
        return 'bg-blue-100';
      case 'rating':
        return 'bg-yellow-100';
      case 'system':
        return 'bg-purple-100';
      default:
        return 'bg-gray-100';
    }
  }

  getNotificationIconColor(type: string): string {
    switch (type) {
      case 'job_request':
        return 'text-orange-600';
      case 'job_completed':
        return 'text-green-600';
      case 'payment':
        return 'text-blue-600';
      case 'rating':
        return 'text-yellow-600';
      case 'system':
        return 'text-purple-600';
      default:
        return 'text-gray-600';
    }
  }

  getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  trackByNotificationId(
    index: number,
    notification: WorkerNotification
  ): string {
    return notification.id || index.toString();
  }

  async acceptNotificationJob(notification: WorkerNotification, event: Event) {
    event.stopPropagation();
    if (notification.bookingId) {
      await this.openJobDetailsModal(notification.bookingId, notification.id!);
    }
  }

  async declineNotificationJob(notification: WorkerNotification, event: Event) {
    event.stopPropagation();
    if (notification.id) {
      await this.handleJobDeclined(notification.id);
    }
  }

  async openJobDetailsModal(bookingId: string, notificationId: string) {
    const modal = await this.modalController.create({
      component: JobDetailsModalComponent,
      componentProps: {
        bookingId,
        notificationId,
      },
      cssClass: 'job-details-modal',
    });

    modal.onDidDismiss().then((result) => {
      if (result.data) {
        if (result.data.action === 'accepted') {
          this.handleJobAccepted(result.data);
        } else if (result.data.action === 'declined') {
          this.handleJobDeclined(result.data.notificationId);
        }
      }
    });

    await modal.present();
  }

  private async handleJobAccepted(data: any) {
    try {
      await this.jobManagementService.acceptJob(
        data.bookingId,
        data.notificationId
      );
      this.showToast('Job accepted successfully!', 'success');
    } catch (error) {
      console.error('Error accepting job:', error);
      this.showToast('Error accepting job. Please try again.', 'danger');
    }
  }

  private async handleJobDeclined(notificationId: string) {
    try {
      await this.jobManagementService.declineJob(notificationId);
      this.showToast('Job declined', 'medium');
    } catch (error) {
      console.error('Error declining job:', error);
    }
  }

  async onNotificationClick(notification: WorkerNotification) {
    if (notification.type === 'job_request') {
      const anyNotif = notification as any;
      const bookingType: 'quick' | 'regular' =
        anyNotif.bookingType || 'regular';

      // Route based on origin
      if (bookingType === 'quick') {
        this.router.navigate(['/pages/worker/worker-booking-details'], {
          queryParams: { bookingId: notification.bookingId, type: 'quick' },
        });
      } else {
        this.router.navigate(['/worker-booking-requests']);
      }
    }

    // Mark as read
    if (!notification.read) {
      await this.notificationService.markAsRead(notification.id!);
    }
  }

  async markAllNotificationsRead() {
    await this.notificationService.markAllAsRead();
    this.showToast('All notifications marked as read', 'success');
  }

  // Job Management
  async acceptJob(job: JobData) {
    if (!job.id) return;

    // Check if worker already has an active job
    if (this.hasActiveJob) {
      this.showToast(
        'You cannot accept another job while you have an active job. Please complete your current job first.',
        'medium'
      );
      return;
    }

    const alert = await this.alertController.create({
      header: 'Accept Job',
      message: `Are you sure you want to accept "${job.title}"?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Accept',
          handler: async () => {
            job.isProcessing = true;

            try {
              await this.jobManagementService.acceptJob(job.id!);
              this.showToast('Job accepted successfully!', 'success');
            } catch (error) {
              console.error('Error accepting job:', error);
              job.isProcessing = false;
              this.showToast(
                'Error accepting job. Please try again.',
                'danger'
              );
            }
          },
        },
      ],
    });

    await alert.present();
  }

  declineJob(job: JobData) {
    // Jobs are automatically filtered by real-time listeners
    this.showToast('Job declined', 'medium');
  }

  async startJob(job: JobData) {
    if (!job.id) return;

    const alert = await this.alertController.create({
      header: 'Start Job',
      message: `Ready to start "${job.title}"?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Start',
          handler: async () => {
            job.isProcessing = true;

            try {
              await this.jobManagementService.startJob(job.id!);
              this.showToast('Job started! Good luck!', 'success');
            } catch (error) {
              console.error('Error starting job:', error);
              job.isProcessing = false;
              this.showToast('Error starting job. Please try again.', 'danger');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async completeJob(job: JobData) {
    if (!job.id) return;

    const alert = await this.alertController.create({
      header: 'Complete Job',
      message: `Mark "${job.title}" as completed?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Complete',
          handler: async () => {
            job.isProcessing = true;

            try {
              await this.jobManagementService.completeJob(job.id!);
              await this.loadWorkerStats(); // Refresh stats
              this.showToast('Job completed successfully!', 'success');
            } catch (error) {
              console.error('Error completing job:', error);
              job.isProcessing = false;
              this.showToast(
                'Error completing job. Please try again.',
                'danger'
              );
            }
          },
        },
      ],
    });

    await alert.present();
  }

  viewJobLocation(job: JobData) {
    const address = job.location?.address;
    if (address) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        address
      )}`;
      window.open(mapsUrl, '_system');
    }
  }

  // Navigate to worker booking details page
  viewJobDetails(job: JobData) {
    if (!job.id) {
      this.showToast('Job ID not available', 'danger');
      return;
    }

    console.log('Navigating to job details:', {
      jobId: job.id,
      jobTitle: job.title,
      jobStatus: job.status,
      jobData: job,
    });

    // Navigate to worker booking details page
    // Try 'quick' first since most active jobs are likely from quick bookings
    this.router.navigate(['/pages/worker/worker-booking-details'], {
      queryParams: {
        bookingId: job.id,
        type: 'quick', // Changed to 'quick' as most active jobs are from quick bookings
      },
    });
  }

  async toggleAvailability() {
    // Use the new online/offline system
    await this.toggleOnlineStatus();
    
    // Keep the old isAvailable property in sync for backward compatibility
    this.isAvailable = this.isOnline;

    // Handle location tracking based on availability
    if (this.isOnline) {
      // Start location tracking when going online
      await this.startLocationTracking();
    } else {
      // Stop location tracking when going offline
      this.stopLocationTracking();

      // Disable location tracking in database
      if (this.userProfile?.uid) {
        try {
          await this.locationTrackingService.disableLocationTracking(
            this.userProfile.uid
          );
        } catch (error) {
          console.error('Error disabling location tracking:', error);
        }
      }
    }
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'accepted':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'medium'
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  // Slideshow controls
  nextSlide() {
    if (this.currentSlideIndex < this.bookingsSlides.length - 1) {
      this.currentSlideIndex++;
    } else {
      this.currentSlideIndex = 0; // Loop back to first slide
    }
  }

  previousSlide() {
    if (this.currentSlideIndex > 0) {
      this.currentSlideIndex--;
    } else {
      this.currentSlideIndex = this.bookingsSlides.length - 1; // Loop to last slide
    }
  }

  goToSlide(index: number) {
    this.currentSlideIndex = index;
  }

  // Quick booking notification controls
  dismissQuickNotification() {
    this.showQuickNotification = false;
    setTimeout(() => {
      this.quickBookingNotification = null;
    }, 300); // Wait for animation to complete
  }

  async acceptQuickBooking() {
    if (!this.quickBookingNotification) return;

    // Check if worker already has an active job
    if (this.hasActiveJob) {
      this.showToast(
        'You cannot accept another job while you have an active job. Please complete your current job first.',
        'medium'
      );
      this.dismissQuickNotification();
      return;
    }

    // Accept booking step
    try {
      await this.quickBookingService.acceptBooking(
        this.quickBookingNotification.bookingId,
        this.userProfile!.uid,
        this.userProfile!.fullName || 'Worker'
      );
    } catch (error) {
      console.error('Error accepting quick booking:', error);
      this.showToast('Error accepting booking. Please try again.', 'danger');
      return;
    }

    // Post-accept UI and navigation
    this.showToast('Quick booking accepted successfully!', 'success');
    this.dismissQuickNotification();
    this.router
      .navigate(['/pages/worker/worker-booking-details'], {
        queryParams: {
          bookingId: this.quickBookingNotification.bookingId,
          type: 'quick',
        },
      })
      .catch(() => {
        this.showToast('Navigation failed. Please try again.', 'danger');
      });
  }

  // Refresh jobs and update timestamp
  async refreshJobs() {
    await this.jobManagementService.refreshJobs();
    this.lastRefreshTime = new Date();
    this.showToast('Jobs refreshed successfully', 'success');

    // Regenerate slides with updated data
    this.generateBookingSlides();
  }

  // Navigation methods for quick actions
  navigateToJobListings() {
    this.router.navigate(['/pages/worker/job-listings']);
  }

  navigateToBookingRequests() {
    this.router.navigate(['/worker-booking-requests']);
  }

  navigateToJobHistory() {
    this.router.navigate(['/pages/worker/job-history']);
  }

  navigateToBookingHistory() {
    console.log('🔍 Navigating to Booking History...');
    console.log('- Current user:', this.userProfile?.uid);
    console.log('- User role:', this.userProfile?.role);

    if (!this.userProfile?.uid) {
      console.warn('⚠️ No user profile found, cannot navigate');
      this.showToast('Please log in to view booking history', 'danger');
      return;
    }

    console.log('✅ Navigating to /pages/worker/booking-history');
    this.router
      .navigate(['/pages/worker/booking-history'])
      .then((success) => {
        console.log('Navigation result:', success);
      })
      .catch((error) => {
        console.error('Navigation error:', error);
        this.showToast('Navigation failed. Please try again.', 'danger');
      });
  }

  navigateToQuickBookingHistory() {
    console.log('🔍 Navigating to Quick Booking History...');
    console.log('- Current user:', this.userProfile?.uid);
    console.log('- User role:', this.userProfile?.role);

    if (!this.userProfile?.uid) {
      console.warn('⚠️ No user profile found, cannot navigate');
      this.showToast('Please log in to view booking history', 'danger');
      return;
    }

    console.log('✅ Navigating to /pages/worker/quick-booking-history');
    this.router
      .navigate(['/pages/worker/quick-booking-history'])
      .then((success) => {
        console.log('Navigation result:', success);
      })
      .catch((error) => {
        console.error('Navigation error:', error);
        this.showToast('Navigation failed. Please try again.', 'danger');
      });
  }

  async logout() {
    const alert = await this.alertController.create({
      header: 'Confirm Logout',
      message: 'Are you sure you want to log out?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Log out',
          role: 'destructive',
          handler: async () => {
            await this.authService.logout();
          },
        },
      ],
    });
    await alert.present();
  }

  // Load available bookings from quickbookings collection
  async loadAvailableBookings() {
    if (!this.userProfile?.uid || !this.workerProfile || !this.isAvailableForQuickBookings) return;

    try {
      const quickBookingsRef = collection(this.firestore, 'quickbookings');
      const q = query(quickBookingsRef, where('status', '==', 'searching'));

      // Real-time listener for available bookings
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const currentRelevantIds: string[] = [];
        let firstNewBooking: any | null = null;
        let currentDisplayedStillValid = false;

        // Update the list fully for UI
        this.availableBookings = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .filter((b) => this.isBookingRelevantToWorker(b))
          .map((b) => ({
            ...b,
            isProcessing: false,
            distance: this.calculateDistanceToBooking(b['location']),
          }));

        if (this.currentLocation) {
          this.availableBookings.sort(
            (a, b) => (a.distance || 999) - (b.distance || 999)
          );
        }

        this.availableBookings.forEach((b) => currentRelevantIds.push(b.id));

        // Detect per-change events for better toast timing
        snapshot.docChanges().forEach((change) => {
          const data = change.doc.data();
          const booking = { id: change.doc.id, ...data } as any;
          const relevant = this.isBookingRelevantToWorker(booking);

          if (change.type === 'added' && relevant) {
            if (!this.lastQuickBookingIds.has(booking.id) && !firstNewBooking) {
              firstNewBooking = booking;
            }
          }

          if (change.type === 'modified') {
            if (
              this.quickBookingNotification?.id === booking.id &&
              (booking.status !== 'searching' || !!booking.assignedWorker)
            ) {
              currentDisplayedStillValid = false;
            }
          }
        });

        // If we have a newly added relevant booking, show toast
        if (firstNewBooking) {
          this.showQuickBookingNotification(firstNewBooking);
        }

        // Decide if current toast should remain visible
        if (this.quickBookingNotification) {
          const stillExists = currentRelevantIds.includes(
            this.quickBookingNotification.id
          );
          if (!stillExists) {
            this.dismissQuickNotification();
          }
        }

        // Update last seen IDs
        this.lastQuickBookingIds = new Set(currentRelevantIds);
      });

      // Store the unsubscribe function to clean up later
      this.subscriptions.push({ unsubscribe } as any);
    } catch (error) {
      console.error('Error loading available bookings:', error);
      this.showToast('Error loading available bookings', 'danger');
    }
  }

  // Check if booking is relevant to worker's skills
  private isBookingRelevantToWorker(booking: any): boolean {
    if (!this.workerProfile?.skills || !booking.categoryId) return true;

    // Check if worker has skills matching the booking category or sub-service
    return this.workerProfile.skills.some(
      (skill) =>
        skill === booking.categoryId ||
        skill === booking.subService ||
        skill
          .toLowerCase()
          .includes(booking.categoryName?.toLowerCase() || '') ||
        skill.toLowerCase().includes(booking.subService?.toLowerCase() || '')
    );
  }

  // Calculate distance from worker's current location to booking location
  private calculateDistanceToBooking(bookingLocation: any): number | null {
    if (
      !this.currentLocation ||
      !bookingLocation?.lat ||
      !bookingLocation?.lng
    ) {
      return null;
    }

    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(
      bookingLocation.lat - this.currentLocation.latitude
    );
    const dLng = this.deg2rad(
      bookingLocation.lng - this.currentLocation.longitude
    );

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(this.currentLocation.latitude)) *
        Math.cos(this.deg2rad(bookingLocation.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  // Accept a booking
  async acceptBooking(booking: any) {
    if (!this.userProfile?.uid || booking.isProcessing) return;

    // Check if worker already has an active job
    if (this.hasActiveJob) {
      this.showToast(
        'You cannot accept another job while you have an active job. Please complete your current job first.',
        'medium'
      );
      return;
    }

    booking.isProcessing = true;

    // Accept in Firestore
    try {
      const bookingRef = doc(this.firestore, 'quickbookings', booking.id);
      await updateDoc(bookingRef, {
        assignedWorker: this.userProfile.uid,
        status: 'accepted',
        acceptedAt: Timestamp.now(),
        workerDetails: {
          id: this.userProfile.uid,
          name: this.userProfile.fullName,
          phone: this.userProfile.email, // Using email as contact for now
          rating: this.workerProfile?.rating || 0,
        },
      });
    } catch (error) {
      console.error('Error accepting booking:', error);
      this.showToast('Error accepting booking. Please try again.', 'danger');
      booking.isProcessing = false;
      return;
    }

    // Post-accept UI and navigation
    this.showToast('Booking accepted successfully!', 'success');
    this.router
      .navigate(['/pages/worker/worker-booking-details'], {
        queryParams: { bookingId: booking.id, type: 'quick' },
      })
      .catch(() => {
        this.showToast('Navigation failed. Please try again.', 'danger');
      });
  }

  // Navigate to active bookings page
  viewActiveBookings() {
    console.log('Navigating to active bookings');
    this.router.navigate(['/pages/worker/active-bookings']);
  }

  // Navigate to booking requests page
  goToBookingRequests() {
    console.log('Navigating to booking requests');
    this.router.navigate(['/worker-booking-requests']);
  }

  // Refresh available bookings
  async refreshAvailableBookings() {
    await this.loadAvailableBookings();
    this.showToast('Available bookings refreshed', 'success');
  }

  // Navigate to update profile page
  updateProfile() {
    console.log('Navigating to update profile');
    this.router.navigate(['/pages/worker/update-profile']);
  }

  // Helper methods for notification booking data
  hasBookingData(notification: WorkerNotification): boolean {
    // Check if notification has any additional booking data
    const notificationWithData = notification as any;
    return !!(
      notificationWithData.clientName ||
      notificationWithData.subService ||
      notificationWithData.schedule
    );
  }

  getBookingDataValue(
    notification: WorkerNotification,
    field: string
  ): string | null {
    // Safely get booking data value from notification
    const notificationWithData = notification as any;
    return notificationWithData[field] || null;
  }

  formatNotificationSchedule(notification: WorkerNotification): string {
    // Format schedule data from notification
    const schedule = (notification as any).schedule;
    if (!schedule) return 'Not scheduled';

    if (typeof schedule === 'string') {
      return schedule;
    }

    if (schedule.date && schedule.time) {
      return `${schedule.date} at ${schedule.time}`;
    }

    if (schedule.date) {
      return schedule.date;
    }

    return 'Not scheduled';
  }

  /**
   * Toggle worker online/offline status
   */
  async toggleOnlineStatus() {
    if (!this.userProfile?.uid) return;

    try {
      this.isOnline = !this.isOnline;
      await this.workerAvailabilityService.setWorkerOnlineStatus(
        this.userProfile.uid,
        this.isOnline,
        this.isAvailableForQuickBookings
      );

      const message = this.isOnline ? 'You are now online and available for bookings' : 'You are now offline and unavailable for bookings';
      const toast = await this.toastController.create({
        message,
        duration: 2000,
        position: 'bottom',
        color: this.isOnline ? 'success' : 'warning'
      });
      toast.present();

      // If going offline, stop quick booking monitoring
      if (!this.isOnline) {
        this.isAvailableForQuickBookings = false;
        this.quickBookingNotification = null;
        this.showQuickNotification = false;
      }
    } catch (error) {
      console.error('Error updating online status:', error);
      this.isOnline = !this.isOnline; // Revert on error
    }
  }

  /**
   * Toggle availability for quick bookings (only when online)
   */
  async toggleQuickBookingAvailability() {
    if (!this.userProfile?.uid || !this.isOnline) return;

    try {
      this.isAvailableForQuickBookings = !this.isAvailableForQuickBookings;
      await this.workerAvailabilityService.setWorkerOnlineStatus(
        this.userProfile.uid,
        this.isOnline,
        this.isAvailableForQuickBookings
      );

      const message = this.isAvailableForQuickBookings 
        ? 'You will now receive quick booking notifications' 
        : 'Quick booking notifications disabled';
      
      const toast = await this.toastController.create({
        message,
        duration: 2000,
        position: 'bottom',
        color: 'primary'
      });
      toast.present();

      // If disabling quick bookings, hide any current notification and clear bookings list
      if (!this.isAvailableForQuickBookings) {
        this.quickBookingNotification = null;
        this.showQuickNotification = false;
        this.availableBookings = []; // Clear the available bookings list
      } else {
        // If enabling quick bookings, reload available bookings
        this.loadAvailableBookings();
      }
    } catch (error) {
      console.error('Error updating quick booking availability:', error);
      this.isAvailableForQuickBookings = !this.isAvailableForQuickBookings; // Revert on error
    }
  }

  /**
   * Load worker's current availability status
   */
  async loadWorkerAvailabilityStatus() {
    if (!this.userProfile?.uid) return;

    try {
      const status = await this.workerAvailabilityService.getWorkerOnlineStatus(this.userProfile.uid);
      if (status) {
        this.isOnline = status.isOnline;
        this.isAvailableForQuickBookings = status.isAvailableForQuickBookings;
      }
    } catch (error) {
      console.error('Error loading worker availability status:', error);
    }
  }

  /**
   * Check if worker has any conflicting bookings for today
   */
  async checkTodayAvailability(): Promise<boolean> {
    if (!this.userProfile?.uid) return false;

    const today = this.workerAvailabilityService.formatDateToString(new Date());
    const currentTime = new Date().toTimeString().slice(0, 5); // Get HH:mm format

    try {
      const availabilityCheck = await this.workerAvailabilityService.isWorkerAvailable(
        this.userProfile.uid,
        today,
        currentTime,
        1
      );
      return !availabilityCheck.hasConflict;
    } catch (error) {
      console.error('Error checking today\'s availability:', error);
      return false;
    }
  }
}
