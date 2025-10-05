import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, UserProfile } from '../../../services/auth.service';
import {
  DashboardService,
  BookingDetails,
  WorkerProfile,
  NotificationData,
} from '../../../services/dashboard.service';
import { Subscription } from 'rxjs';

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

export interface ServiceCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
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
    private router: Router
  ) {
    this.initializeServiceCategories();
  }

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

  private initializeServiceCategories() {
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
        description: 'Pipes, fixtures & repairs',
      },
      {
        id: 'electrical',
        name: 'Electrical',
        icon: 'flash-outline',
        color: 'from-yellow-500 to-orange-500',
        description: 'Wiring & electrical work',
      },
      {
        id: 'gardening',
        name: 'Gardening',
        icon: 'leaf-outline',
        color: 'from-green-500 to-emerald-500',
        description: 'Lawn care & landscaping',
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
        description: 'Interior & exterior painting',
      },
      {
        id: 'laundry',
        name: 'Laundry',
        icon: 'shirt-outline',
        color: 'from-teal-500 to-cyan-500',
        description: 'Washing & dry cleaning',
      },
      {
        id: 'appliance',
        name: 'Appliances',
        icon: 'build-outline',
        color: 'from-gray-500 to-slate-500',
        description: 'Repair & maintenance',
      },
    ];
  }

  private async loadDashboardData() {
    if (!this.userProfile?.uid) return;

    try {
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

    const bookingsSub = this.dashboardService
      .loadActiveBookings(this.userProfile.uid)
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

  viewBookings() {
    this.router.navigate(['/pages/my-bookings']);
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
