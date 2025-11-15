import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, UserProfile } from '../../../services/auth.service';
import {
  DashboardService,
  BookingDetails,
  WorkerProfile,
  NotificationData,
  ServiceCategory,
} from '../../../services/dashboard.service';
import { QuickBookingService } from '../../../services/quick-booking.service';
import { Subscription, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { register } from 'swiper/element/bundle';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  Timestamp,
  doc,
  updateDoc,
  deleteDoc,
} from '@angular/fire/firestore';
import { ToastController } from '@ionic/angular';

export interface Booking {
  id: string;
  clientId: string;
  workerId: string;
  workerName: string;
  workerAvatar?: string;
  serviceType: string;
  status:
    | 'pending'
    | 'accepted'
    | 'on-the-way'
    | 'in-progress'
    | 'completed'
    | 'cancelled';
  scheduledDate: Date;
  scheduledTime: string;
  address: string;
  description: string;
  price: number;
  workerLocation?: {
    latitude: number;
    longitude: number;
    lastUpdated: Date;
  };
  createdAt: Date;
}

export interface Worker {
  id: string;
  fullName: string;
  avatar?: string;
  rating: number;
  services: string[];
  totalJobs: number;
  isOnline: boolean;
}

export interface Ad {
  id: string;
  imageUrl: string;
  actionUrl?: string;
  altText: string;
  isLoading?: boolean;
}

@Component({
  selector: 'app-client-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class ClientDashboardPage implements OnInit, OnDestroy {
  userProfile: UserProfile | null = null;
  upcomingBookings: Booking[] = [];
  recentWorkers: Worker[] = [];
  serviceCategories: ServiceCategory[] = [];
  notifications: any[] = [];
  ads: Ad[] = [];
  isLoading = true;

  // Notification system
  showNotificationModal = false;
  unreadCount = 0;
  clientNotifications: NotificationData[] = [];

  private subscriptions: Subscription[] = [];
  private notifiedBookingIds = new Set<string>();

  constructor(
    private authService: AuthService,
    private dashboardService: DashboardService,
    private quickBookingService: QuickBookingService,
    private router: Router,
    private firestore: Firestore,
    private toastController: ToastController
  ) {
    // Register Swiper web components
    register();
    this.initializeAds();
  }

  ngOnInit() {
    // Subscribe to user profile
    const profileSub = this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile) {
        this.loadDashboardData();
        this.setupBookingNotificationsMonitoring();
      }
    });
    this.subscriptions.push(profileSub);
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  private async loadServiceCategories() {
    try {
      // Load service categories from database
      this.serviceCategories =
        await this.dashboardService.getServiceCategories();

      // Filter to show only active categories
      this.serviceCategories = this.serviceCategories.filter(
        (category) => category.isActive
      );

      // If no active categories are found, use fallback
      if (this.serviceCategories.length === 0) {
        throw new Error('No active categories found');
      }
    } catch (error) {
      console.error('Error loading service categories:', error);

      // Fallback to default categories if database fetch fails
      this.serviceCategories = [
        {
          id: 'cleaning',
          name: 'Cleaning',
          icon: 'sparkles-outline',
          color: '#3B82F6',
          description: 'House & office cleaning',
          isActive: true,
          services: ['House Cleaning', 'Office Cleaning'],
        },
        {
          id: 'plumbing',
          name: 'Plumbing',
          icon: 'water-outline',
          color: '#6366F1',
          description: 'Pipes, fixtures & repairs',
          isActive: true,
          services: ['Pipe Repair', 'Fixture Installation'],
        },
        {
          id: 'electrical',
          name: 'Electrical',
          icon: 'flash-outline',
          color: '#F59E0B',
          description: 'Wiring & electrical work',
          isActive: true,
          services: ['Wiring', 'Electrical Repair'],
        },
      ];
    }
  }

  private async loadDashboardData() {
    if (!this.userProfile?.uid) return;

    try {
      // Load service categories
      await this.loadServiceCategories();

      // Load upcoming bookings
      await this.loadUpcomingBookings();

      // Load recent workers
      await this.loadRecentWorkers();

      // Load dashboard notifications
      this.loadDashboardNotifications();

      // Load client notifications for the notification system
      this.loadClientNotificationsForModal();

      this.isLoading = false;
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      this.isLoading = false;
    }
  }

  private async loadUpcomingBookings() {
    if (!this.userProfile?.uid) return;

    // Combine regular bookings and quick bookings
    const bookingsSub = combineLatest([
      this.dashboardService.loadActiveBookings(this.userProfile.uid),
      this.dashboardService.loadActiveQuickBookings(this.userProfile.uid),
    ])
      .pipe(
        map(([regularBookings, quickBookings]) => {
          // Combine and sort by creation date (most recent first)
          const allBookings = [...regularBookings, ...quickBookings];
          return allBookings.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        })
      )
      .subscribe((bookings) => {
        this.upcomingBookings = bookings;
      });

    this.subscriptions.push(bookingsSub);
  }

  private async loadRecentWorkers() {
    if (!this.userProfile?.uid) return;

    try {
      this.recentWorkers = await this.dashboardService.loadRecentWorkers(
        this.userProfile.uid
      );
    } catch (error) {
      console.error('Error loading recent workers:', error);
      // Fallback to mock data
      this.recentWorkers = [
        {
          id: '1',
          fullName: 'Maria Santos',
          avatar: 'assets/avatars/maria.jpg',
          rating: 4.8,
          services: ['cleaning', 'laundry'],
          totalJobs: 127,
          isOnline: true,
        },
        {
          id: '2',
          fullName: 'John Wilson',
          avatar: 'assets/avatars/john.jpg',
          rating: 4.9,
          services: ['plumbing', 'electrical'],
          totalJobs: 89,
          isOnline: false,
        },
      ];
    }
  }

  private loadDashboardNotifications() {
    if (!this.userProfile?.uid) return;

    const notificationsSub = this.dashboardService
      .loadNotifications(this.userProfile.uid)
      .subscribe(
        (notifications) => {
          this.notifications = notifications;
        },
        (error) => {
          console.error('Error loading notifications:', error);
          // Fallback to mock data
          this.notifications = [
            {
              id: '1',
              title: 'Service Reminder',
              message:
                'Your cleaning service is scheduled for tomorrow at 2 PM',
              type: 'reminder',
              timestamp: new Date(),
            },
            {
              id: '2',
              title: 'Special Offer',
              message: 'Get 20% off your next electrical service',
              type: 'promotion',
              timestamp: new Date(),
            },
          ];
        }
      );
    this.subscriptions.push(notificationsSub);
  }

  // Navigation methods
  bookService(categoryId?: string) {
    this.router.navigate(['/client/book-service']);
  }

  quickBooking() {
    this.router.navigate(['/client/select-category'], {
      queryParams: { type: 'quick' },
    });
  }

  viewBookings() {
    this.router.navigate(['/client/booking-history']);
  }

  viewQuickBookingsHistory() {
    this.router.navigate(['/pages/quick-bookings-history']);
  }

  async trackWorker(booking: Booking) {
    try {
      const location = await this.dashboardService.getWorkerLocation(
        booking.workerId
      );
      if (location) {
        const { latitude, longitude } = location;
        const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
        window.open(url, '_blank');
      } else {
        // Show message that worker location is not available
        console.log('Worker location not available');
      }
    } catch (error) {
      console.error('Error getting worker location:', error);
    }
  }

  openSupport() {
    this.router.navigate(['/support']);
  }

  rebookWorker(workerId: string) {
    this.router.navigate(['/book-service'], { queryParams: { workerId } });
  }

  viewProfile() {
    this.router.navigate(['/profile']);
  }

  goToProfile() {
    this.router.navigate(['/pages/profile']);
  }

  getStatusColor(status: string): string {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      accepted: 'bg-blue-100 text-blue-800',
      'on-the-way': 'bg-purple-100 text-purple-800',
      'in-progress': 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  }

  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  async logout() {
    await this.authService.logout();
  }

  private initializeAds() {
    this.ads = [
      {
        id: '1',
        imageUrl: 'assets/ads/5.png',
        actionUrl: '/book-service?category=cleaning',
        altText: 'Special 20% discount on home cleaning services',
      },
      {
        id: '2',
        imageUrl: 'assets/ads/6.png',
        actionUrl: '/book-service?category=gardening',
        altText: 'New professional gardening service available',
      },
      {
        id: '3',
        imageUrl: 'assets/ads/7.png',
        actionUrl: '/premium',
        altText: 'Premium membership with exclusive benefits',
      },
      {
        id: '4',
        imageUrl: 'assets/ads/8.png',
        actionUrl: '/referral',
        altText: 'Refer friends and earn rewards',
      },
      {
        id: '5',
        imageUrl: 'assets/ads/5.png',
        actionUrl: '/quick-booking',
        altText: 'Quick booking for immediate service needs',
      },
    ];
  }

  onAdClick(ad: Ad) {
    if (ad.actionUrl) {
      this.router.navigate([ad.actionUrl]);
    } else {
      // Default action - navigate to book service
      this.bookService();
    }
  }

  onImageError(event: any, ad: Ad) {
    // Replace with a fallback image when the original fails to load
    event.target.src = 'assets/ads/fallback-ad.jpg';
    console.log(`Failed to load ad image: ${ad.imageUrl}`);
  }

  // Notification methods
  private setupBookingNotificationsMonitoring() {
    if (!this.userProfile?.uid) return;

    // Monitor both bookings and quickbookings collections
    const bookingsRef = collection(this.firestore, 'bookings');
    const quickBookingsRef = collection(this.firestore, 'quickbookings');

    // Query for ALL client bookings to catch status transitions
    const bookingsQuery = query(
      bookingsRef,
      where('clientId', '==', this.userProfile.uid),
      orderBy('updatedAt', 'desc')
    );

    // Query for ALL quick bookings to catch status transitions
    const quickBookingsQuery = query(
      quickBookingsRef,
      where('clientId', '==', this.userProfile.uid),
      orderBy('createdAt', 'desc')
    );

    // Listen for booking changes
    const unsubscribeBookings = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        console.log(
          'Dashboard: Booking snapshot received, changes:',
          snapshot.docChanges().length
        );
        snapshot.docChanges().forEach((change) => {
          console.log('Dashboard: Booking change detected:', {
            type: change.type,
            id: change.doc.id,
            status: change.doc.data()['status'],
            workerName: change.doc.data()['workerName'],
            assignedWorker: change.doc.data()['assignedWorker'],
          });

          if (change.type === 'modified') {
            const bookingData = change.doc.data();
            const bookingId = change.doc.id;

            // Check if we've already notified about this status change
            const notificationKey = `${bookingId}-${bookingData['status']}`;
            if (this.notifiedBookingIds.has(notificationKey)) {
              console.log(
                'Dashboard: Already notified about this status change:',
                notificationKey
              );
              return;
            }

            // Only notify if status is accepted, on-the-way, or in-progress
            if (
              bookingData['status'] === 'accepted' ||
              bookingData['status'] === 'on-the-way' ||
              bookingData['status'] === 'in-progress'
            ) {
              this.notifiedBookingIds.add(notificationKey);
              console.log('Creating notification for booking status change:', {
                bookingId,
                status: bookingData['status'],
                workerName: bookingData['workerName'],
                assignedWorker: bookingData['assignedWorker'],
              });
              this.createBookingAcceptedNotification(
                bookingData,
                bookingId,
                'booking'
              );
            } else {
              console.log(
                'Dashboard: Status not eligible for notification:',
                bookingData['status']
              );
            }
          }
        });
      },
      (error) => {
        console.error('Error monitoring bookings:', error);
      }
    );

    // Listen for quick booking changes
    const unsubscribeQuickBookings = onSnapshot(
      quickBookingsQuery,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'modified') {
            const bookingData = change.doc.data();
            const bookingId = change.doc.id;

            // Check if we've already notified about this status change
            const notificationKey = `${bookingId}-${bookingData['status']}`;
            if (this.notifiedBookingIds.has(notificationKey)) {
              return;
            }

            // Only notify if status is accepted, on-the-way, or in-progress
            if (
              bookingData['status'] === 'accepted' ||
              bookingData['status'] === 'on-the-way' ||
              bookingData['status'] === 'in-progress'
            ) {
              this.notifiedBookingIds.add(notificationKey);
              console.log(
                'Creating notification for quick booking status change:',
                {
                  bookingId,
                  status: bookingData['status'],
                  assignedWorker: bookingData['assignedWorker'],
                }
              );
              this.createBookingAcceptedNotification(
                bookingData,
                bookingId,
                'quick'
              );
            }
          }
        });
      },
      (error) => {
        console.error('Error monitoring quick bookings:', error);
      }
    );

    // Store unsubscribe functions
    this.subscriptions.push({ unsubscribe: unsubscribeBookings } as any);
    this.subscriptions.push({ unsubscribe: unsubscribeQuickBookings } as any);
  }

  private async createBookingAcceptedNotification(
    booking: any,
    bookingId: string,
    type: string
  ) {
    try {
      // Helper function to remove undefined values
      const removeUndefined = (obj: any): any => {
        const cleaned: any = {};
        for (const key in obj) {
          if (obj[key] !== undefined) {
            cleaned[key] = obj[key];
          }
        }
        return cleaned;
      };

      const notificationRef = collection(
        this.firestore,
        `users/${this.userProfile!.uid}/notifications`
      );

      const workerName =
        booking.workerName ||
        booking.assignedWorkerName ||
        booking.workerDetails?.name ||
        'Worker';

      const serviceName =
        booking.categoryName ||
        booking.neededService ||
        booking.subService ||
        booking.specificService ||
        'Service';

      const notificationData = {
        title: '🎉 Your booking has been accepted!',
        message: `${workerName} has accepted your ${serviceName} booking.`,
        userId: this.userProfile!.uid,
        type: 'worker_found' as const,
        priority: 'high' as const,
        isRead: false,
        createdAt: Timestamp.now(),
        metadata: {
          bookingId: bookingId,
          bookingType: type,
          workerId: booking.assignedWorker,
          workerName: workerName,
        },
        ...removeUndefined({
          bookingData: {
            clientName: booking.clientName,
            categoryName: booking.categoryName || booking.neededService,
            subService: booking.subService || booking.specificService,
            schedule: booking.scheduledDate,
            scheduleTime: booking.scheduledTime,
            location: booking.location,
            notes: booking.notes || booking.additionalNotes,
            workerName: workerName,
          },
        }),
      };

      await addDoc(notificationRef, notificationData);
      console.log('✅ Created booking accepted notification:', bookingId);

      // Update unread count
      this.unreadCount++;
    } catch (error) {
      console.error('Error creating booking accepted notification:', error);
    }
  }

  openNotificationModal() {
    this.showNotificationModal = true;
    document.body.style.overflow = 'hidden';

    // Load client notifications for the modal
    this.loadClientNotificationsForModal();
  }

  closeNotificationModal(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.showNotificationModal = false;
    document.body.style.overflow = '';
  }

  async clearAllClientNotifications() {
    if (!this.userProfile?.uid || this.clientNotifications.length === 0) return;

    try {
      const deletions = this.clientNotifications
        .filter((n) => !!n.id)
        .map((n) =>
          deleteDoc(
            doc(
              this.firestore,
              `users/${this.userProfile!.uid}/notifications/${n.id}`
            )
          )
        );
      await Promise.all(deletions);

      // Update local state immediately
      this.clientNotifications = [];
      this.unreadCount = 0;

      // Optional toast feedback
      await this.toastController
        .create({
          message: 'All notifications cleared',
          duration: 1500,
          color: 'success',
        })
        .then((t) => t.present());
    } catch (error) {
      console.error('Error clearing client notifications:', error);
      await this.toastController
        .create({
          message: 'Failed to clear notifications',
          duration: 1800,
          color: 'danger',
        })
        .then((t) => t.present());
    }
  }

  private async loadClientNotificationsForModal() {
    if (!this.userProfile?.uid) return;

    const notificationsRef = collection(
      this.firestore,
      `users/${this.userProfile.uid}/notifications`
    );
    const q = query(notificationsRef, orderBy('createdAt', 'desc'));

    try {
      onSnapshot(q, (snapshot) => {
        this.clientNotifications = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            } as NotificationData)
        );

        this.unreadCount = this.clientNotifications.filter(
          (n) => !n.isRead
        ).length;
      });
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  async markNotificationAsRead(notificationId: string) {
    if (!this.userProfile?.uid) return;

    try {
      const notificationRef = doc(
        this.firestore,
        `users/${this.userProfile.uid}/notifications/${notificationId}`
      );
      await updateDoc(notificationRef, { isRead: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  async onNotificationClick(notification: NotificationData) {
    // Mark as read
    if (!notification.isRead && notification.id) {
      await this.markNotificationAsRead(notification.id);
    }

    // Navigate based on notification type
    if (notification.metadata?.bookingId) {
      const metadata = notification.metadata as any;
      const bookingType = metadata.bookingType || 'booking';
      const bookingId = notification.metadata.bookingId;

      console.log('Navigating to booking progress for:', {
        bookingId,
        bookingType,
        metadata,
      });

      // Navigate to booking progress page for both regular and quick bookings
      this.router.navigate(['/client/booking-progress', bookingId]);

      this.closeNotificationModal();
    } else {
      console.warn(
        'No booking ID found in notification metadata:',
        notification
      );
    }
  }

  getNotificationIcon(type: string): string {
    switch (type) {
      case 'worker_found':
      case 'booking':
        return 'checkmark-circle';
      case 'booking_update':
        return 'information-circle';
      case 'payment':
        return 'card';
      case 'promotion':
        return 'gift';
      default:
        return 'notifications';
    }
  }

  getNotificationDate(date: Date | Timestamp): Date {
    if (date instanceof Date) {
      return date;
    } else if (date && typeof (date as any).toDate === 'function') {
      return (date as Timestamp).toDate();
    }
    return new Date();
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
}
