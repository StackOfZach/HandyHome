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
  isLoading = true;

  private subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private dashboardService: DashboardService,
    private quickBookingService: QuickBookingService,
    private router: Router
  ) {}

  ngOnInit() {
    // Subscribe to user profile
    const profileSub = this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile) {
        this.loadDashboardData();
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
          averagePrice: 500,
          estimatedDuration: 120,
        },
        {
          id: 'plumbing',
          name: 'Plumbing',
          icon: 'water-outline',
          color: '#6366F1',
          description: 'Pipes, fixtures & repairs',
          isActive: true,
          services: ['Pipe Repair', 'Fixture Installation'],
          averagePrice: 800,
          estimatedDuration: 90,
        },
        {
          id: 'electrical',
          name: 'Electrical',
          icon: 'flash-outline',
          color: '#F59E0B',
          description: 'Wiring & electrical work',
          isActive: true,
          services: ['Wiring', 'Electrical Repair'],
          averagePrice: 1000,
          estimatedDuration: 120,
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

      // Load notifications
      this.loadNotifications();

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

  private loadNotifications() {
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
    this.router.navigate(['/pages/book-service'], {
      queryParams: { category: categoryId },
    });
  }

  quickBooking() {
    this.router.navigate(['/client/select-category'], {
      queryParams: { type: 'quick' },
    });
  }

  viewBookings() {
    this.router.navigate(['/pages/my-bookings']);
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
}
