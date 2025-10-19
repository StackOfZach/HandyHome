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
  monthlyEarnings: number;
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
    total: number;
    workerEarning: number;
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

  // Notification data
  notifications: WorkerNotification[] = [];
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
    monthlyEarnings: 0,
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
    private modalController: ModalController
  ) {}

  async ngOnInit() {
    // Subscribe to user profile
    this.subscriptions.push(
      this.authService.userProfile$.subscribe((profile) => {
        this.userProfile = profile;
        if (profile) {
          this.loadWorkerData();
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
        .subscribe((quickBookings) => {
          // Check for new quick bookings that need worker assignment
          const availableQuickBookings = quickBookings.filter(
            (booking) => booking.status === 'pending'
          );

          if (availableQuickBookings.length > 0) {
            const latestBooking = availableQuickBookings[0];
            this.showQuickBookingNotification(latestBooking);
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

    this.quickBookingNotification = {
      id: booking.id,
      title: 'Quick Booking Alert!',
      message: `${booking.serviceType} needed at ${booking.address}`,
      bookingId: booking.id,
      categoryName: booking.serviceCategory || booking.serviceType,
      subService: booking.serviceType,
      clientLocation: booking.address,
      pricing: {
        total: booking.price || 0,
        workerEarning: (booking.price || 0) * 0.8, // Assuming 80% goes to worker
      },
      timestamp: new Date(),
    };

    this.showQuickNotification = true;

    // Auto-hide after 10 seconds if not interacted with
    setTimeout(() => {
      if (this.quickBookingNotification?.id === booking.id) {
        this.dismissQuickNotification();
      }
    }, 10000);
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
            value: `₱${this.workerStats.monthlyEarnings || 0}`,
            label: 'Earnings',
            colorClass: 'from-green-50 to-green-100 border-green-200',
            textColor: 'text-green-700',
            labelColor: 'text-green-600',
          },
          {
            value: this.workerProfile?.rating
              ? this.workerProfile.rating.toFixed(1)
              : '0.0',
            label: 'Rating',
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
            value: `₱${Math.floor(
              (this.workerStats.monthlyEarnings || 0) / 4
            )}`,
            label: 'Weekly Pay',
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
        {
          text: 'View',
          handler: () => {
            this.openJobDetailsModal(notification.bookingId, notification.id!);
          },
        },
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
      // Get stats from worker profile
      this.workerStats = {
        jobsCompleted: this.workerProfile.jobsCompleted || 0,
        monthlyEarnings: this.workerProfile.totalEarnings || 0, // Use totalEarnings as monthlyEarnings for now
        totalEarnings: this.workerProfile.totalEarnings || 0,
      };
    } catch (error) {
      console.error('Error loading worker stats:', error);
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
              // Mark all notifications as read first
              await this.notificationService.markAllAsRead();

              // Clear local arrays
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
      await this.openJobDetailsModal(notification.bookingId, notification.id!);
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

  async toggleAvailability() {
    this.isAvailable = !this.isAvailable;

    const message = this.isAvailable
      ? 'You are now available for jobs'
      : 'You are now offline';

    this.showToast(message, this.isAvailable ? 'success' : 'medium');

    // Handle location tracking based on availability
    if (this.isAvailable) {
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

    // TODO: Update availability status in Firestore
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

    try {
      // Accept the quick booking
      await this.quickBookingService.acceptBooking(
        this.quickBookingNotification.bookingId,
        this.userProfile!.uid,
        this.userProfile!.fullName || 'Worker'
      );

      this.showToast('Quick booking accepted successfully!', 'success');
      this.dismissQuickNotification();
    } catch (error) {
      console.error('Error accepting quick booking:', error);
      this.showToast('Error accepting booking. Please try again.', 'danger');
    }
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

  async logout() {
    await this.authService.logout();
  }

  // Load available bookings from quickbookings collection
  async loadAvailableBookings() {
    if (!this.userProfile?.uid || !this.workerProfile) return;

    try {
      const quickBookingsRef = collection(this.firestore, 'quickbookings');
      const q = query(
        quickBookingsRef,
        where('status', '==', 'searching'),
        orderBy('createdAt', 'desc')
      );

      // Real-time listener for available bookings
      const unsubscribe = onSnapshot(q, (snapshot) => {
        this.availableBookings = [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const booking = {
            id: doc.id,
            ...data,
            isProcessing: false,
            distance: this.calculateDistanceToBooking(data['location']),
          };

          // Only show bookings that match worker's skills
          if (this.isBookingRelevantToWorker(booking)) {
            this.availableBookings.push(booking);
          }
        });

        // Sort by distance if location is available
        if (this.currentLocation) {
          this.availableBookings.sort(
            (a, b) => (a.distance || 999) - (b.distance || 999)
          );
        }
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

    try {
      // Update the booking in Firestore
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

      this.showToast('Booking accepted successfully!', 'success');

      // Navigate to booking details page
      this.router.navigate(['/pages/worker/booking-details'], {
        queryParams: { bookingId: booking.id },
      });
    } catch (error) {
      console.error('Error accepting booking:', error);
      this.showToast('Error accepting booking. Please try again.', 'danger');
      booking.isProcessing = false;
    }
  }

  // Navigate to active bookings page
  viewActiveBookings() {
    console.log('Navigating to active bookings');
    this.router.navigate(['/pages/worker/active-bookings']);
  }

  // Navigate to booking requests page  
  goToBookingRequests() {
    console.log('Navigating to booking requests');
    this.router.navigate(['/pages/worker-booking-requests']);
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
}
