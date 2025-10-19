import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import {
  ToastController,
  LoadingController,
  AlertController,
} from '@ionic/angular';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { BookingService, BookingData } from '../../../services/booking.service';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from '@angular/fire/firestore';
import { Subscription, combineLatest } from 'rxjs';

interface QuickBookingData {
  id?: string;
  clientId: string;
  categoryId: string;
  categoryName: string;
  subService: string;
  location: {
    lat: number;
    lng: number;
    address: string;
    city?: string;
    province?: string;
  };
  pricing: {
    basePrice: number;
    serviceCharge: number;
    total: number;
  };
  estimatedDuration: number;
  status:
    | 'searching'
    | 'accepted'
    | 'on-the-way'
    | 'in-progress'
    | 'completed'
    | 'cancelled';
  assignedWorker: string | null;
  workerName?: string;
  createdAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  clientRating?: number;
  clientReview?: string;
  reviewedAt?: Date;
}

@Component({
  selector: 'app-job-history',
  templateUrl: './job-history.page.html',
  styleUrls: ['./job-history.page.scss'],
  standalone: false,
})
export class JobHistoryPage implements OnInit, OnDestroy {
  userProfile: UserProfile | null = null;
  allJobs: (BookingData | QuickBookingData)[] = [];
  filteredJobs: (BookingData | QuickBookingData)[] = [];
  isLoading = true;
  error: string | null = null;

  // Filter options
  selectedStatus: string = 'all';
  selectedJobType: string = 'all';
  searchTerm: string = '';

  statusOptions = [
    { label: 'All Status', value: 'all' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
  ];

  jobTypeOptions = [
    { label: 'All Types', value: 'all' },
    { label: 'Regular Bookings', value: 'regular' },
    { label: 'Quick Bookings', value: 'quick' },
  ];

  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private authService: AuthService,
    private bookingService: BookingService,
    private firestore: Firestore,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile?.uid) {
        this.loadJobHistory();
      }
    });
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  async loadJobHistory() {
    if (!this.userProfile?.uid) return;

    try {
      this.isLoading = true;
      this.error = null;

      // Set up listeners for both collections
      this.setupRegularBookingsListener();
      this.setupQuickBookingsListener();
    } catch (error) {
      console.error('Error loading job history:', error);
      this.error = 'Failed to load job history';
      this.isLoading = false;
      this.showToast('Failed to load job history', 'danger');
    }
  }

  private setupRegularBookingsListener() {
    if (!this.userProfile?.uid) return;

    const bookingsRef = collection(this.firestore, 'bookings');
    const q = query(
      bookingsRef,
      where('workerId', '==', this.userProfile.uid),
      where('status', 'in', ['completed', 'cancelled']),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const regularJobs: BookingData[] = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();

        // Convert Firestore Timestamp to Date
        const createdAt =
          data['createdAt'] instanceof Timestamp
            ? data['createdAt'].toDate()
            : new Date(data['createdAt']);

        const updatedAt =
          data['updatedAt'] instanceof Timestamp
            ? data['updatedAt'].toDate()
            : data['updatedAt']
            ? new Date(data['updatedAt'])
            : undefined;

        const completedAt =
          data['completedAt'] instanceof Timestamp
            ? data['completedAt'].toDate()
            : data['completedAt']
            ? new Date(data['completedAt'])
            : undefined;

        const cancelledAt =
          data['cancelledAt'] instanceof Timestamp
            ? data['cancelledAt'].toDate()
            : data['cancelledAt']
            ? new Date(data['cancelledAt'])
            : undefined;

        const reviewedAt =
          data['reviewedAt'] instanceof Timestamp
            ? data['reviewedAt'].toDate()
            : data['reviewedAt']
            ? new Date(data['reviewedAt'])
            : undefined;

        const job: BookingData & { jobType: string } = {
          id: docSnap.id,
          ...data,
          createdAt,
          updatedAt,
          completedAt,
          cancelledAt,
          reviewedAt,
          jobType: 'regular',
        } as BookingData & { jobType: string };

        regularJobs.push(job);
      });

      this.updateJobsList(regularJobs, 'regular');
    });

    this.subscriptions.push({ unsubscribe } as any);
  }

  private setupQuickBookingsListener() {
    if (!this.userProfile?.uid) return;

    const quickBookingsRef = collection(this.firestore, 'quickbookings');
    const q = query(
      quickBookingsRef,
      where('assignedWorker', '==', this.userProfile.uid),
      where('status', 'in', ['completed', 'cancelled']),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const quickJobs: QuickBookingData[] = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();

        // Convert Firestore Timestamp to Date
        const createdAt =
          data['createdAt'] instanceof Timestamp
            ? data['createdAt'].toDate()
            : new Date(data['createdAt']);

        const completedAt =
          data['completedAt'] instanceof Timestamp
            ? data['completedAt'].toDate()
            : data['completedAt']
            ? new Date(data['completedAt'])
            : undefined;

        const cancelledAt =
          data['cancelledAt'] instanceof Timestamp
            ? data['cancelledAt'].toDate()
            : data['cancelledAt']
            ? new Date(data['cancelledAt'])
            : undefined;

        const reviewedAt =
          data['reviewedAt'] instanceof Timestamp
            ? data['reviewedAt'].toDate()
            : data['reviewedAt']
            ? new Date(data['reviewedAt'])
            : undefined;

        const job: QuickBookingData & { jobType: string } = {
          id: docSnap.id,
          ...data,
          createdAt,
          completedAt,
          cancelledAt,
          reviewedAt,
          jobType: 'quick',
        } as QuickBookingData & { jobType: string };

        quickJobs.push(job);
      });

      this.updateJobsList(quickJobs, 'quick');
    });

    this.subscriptions.push({ unsubscribe } as any);
  }

  private updateJobsList(newJobs: any[], jobType: string) {
    // Remove old jobs of this type and add new ones
    const otherTypeJobs = this.allJobs.filter(
      (job) => (job as any).jobType !== jobType
    );
    this.allJobs = [...otherTypeJobs, ...newJobs];

    // Sort by creation date (newest first)
    this.allJobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    this.applyFilters();
    this.isLoading = false;
  }

  applyFilters() {
    let filtered = [...this.allJobs];

    // Apply status filter
    if (this.selectedStatus !== 'all') {
      filtered = filtered.filter((job) => job.status === this.selectedStatus);
    }

    // Apply job type filter
    if (this.selectedJobType !== 'all') {
      filtered = filtered.filter(
        (job) => (job as any).jobType === this.selectedJobType
      );
    }

    // Apply search filter
    if (this.searchTerm.trim()) {
      const searchLower = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter((job) => {
        // For regular bookings
        if ((job as any).jobType === 'regular') {
          const regularJob = job as BookingData;
          return (
            regularJob.title?.toLowerCase().includes(searchLower) ||
            regularJob.description?.toLowerCase().includes(searchLower) ||
            regularJob.category?.toLowerCase().includes(searchLower) ||
            regularJob.locations?.some((loc) =>
              loc.address?.toLowerCase().includes(searchLower)
            )
          );
        }
        // For quick bookings
        else {
          const quickJob = job as QuickBookingData;
          return (
            quickJob.categoryName?.toLowerCase().includes(searchLower) ||
            quickJob.subService?.toLowerCase().includes(searchLower) ||
            quickJob.location?.address?.toLowerCase().includes(searchLower)
          );
        }
      });
    }

    this.filteredJobs = filtered;
  }

  onStatusFilterChange() {
    this.applyFilters();
  }

  onJobTypeFilterChange() {
    this.applyFilters();
  }

  onSearchChange() {
    this.applyFilters();
  }

  clearSearch() {
    this.searchTerm = '';
    this.applyFilters();
  }

  async viewJobDetails(job: BookingData | QuickBookingData) {
    const isQuickBooking = (job as any).jobType === 'quick';

    let message = '';
    if (isQuickBooking) {
      const quickJob = job as QuickBookingData;
      message = `
        <div style="text-align: left;">
          <p><strong>Type:</strong> Quick Booking</p>
          <p><strong>Service:</strong> ${quickJob.categoryName} - ${
        quickJob.subService
      }</p>
          <p><strong>Status:</strong> ${quickJob.status}</p>
          <p><strong>Location:</strong> ${quickJob.location.address}</p>
          <p><strong>Total Earned:</strong> ₱${quickJob.pricing.total?.toLocaleString()}</p>
          <p><strong>Duration:</strong> ${quickJob.estimatedDuration} min</p>
          <p><strong>Created:</strong> ${quickJob.createdAt.toLocaleDateString()} ${quickJob.createdAt.toLocaleTimeString()}</p>
          ${
            quickJob.completedAt
              ? `<p><strong>Completed:</strong> ${quickJob.completedAt.toLocaleDateString()} ${quickJob.completedAt.toLocaleTimeString()}</p>`
              : ''
          }
          ${
            quickJob.clientRating
              ? `<p><strong>Client Rating:</strong> ${quickJob.clientRating}/5 stars</p>`
              : ''
          }
          ${
            quickJob.clientReview
              ? `<p><strong>Client Review:</strong> "${quickJob.clientReview}"</p>`
              : ''
          }
          ${
            quickJob.cancellationReason
              ? `<p><strong>Cancellation Reason:</strong> ${quickJob.cancellationReason}</p>`
              : ''
          }
        </div>
      `;
    } else {
      const regularJob = job as BookingData;
      message = `
        <div style="text-align: left;">
          <p><strong>Type:</strong> Regular Booking</p>
          <p><strong>Title:</strong> ${regularJob.title}</p>
          <p><strong>Category:</strong> ${regularJob.category}</p>
          <p><strong>Description:</strong> ${regularJob.description}</p>
          <p><strong>Status:</strong> ${regularJob.status}</p>
          <p><strong>Price Type:</strong> ${regularJob.priceType}</p>
          <p><strong>Total Earned:</strong> ₱${regularJob.total?.toLocaleString()}</p>
          <p><strong>Created:</strong> ${regularJob.createdAt.toLocaleDateString()} ${regularJob.createdAt.toLocaleTimeString()}</p>
          ${
            regularJob.schedule
              ? `<p><strong>Scheduled:</strong> ${regularJob.schedule.date} at ${regularJob.schedule.time}</p>`
              : ''
          }
          ${
            regularJob.completedAt
              ? `<p><strong>Completed:</strong> ${regularJob.completedAt.toLocaleDateString()} ${regularJob.completedAt.toLocaleTimeString()}</p>`
              : ''
          }
          ${
            regularJob.rating
              ? `<p><strong>Client Rating:</strong> ${regularJob.rating}/5 stars</p>`
              : ''
          }
          ${
            regularJob.review
              ? `<p><strong>Client Review:</strong> "${regularJob.review}"</p>`
              : ''
          }
          ${
            regularJob.cancellationReason
              ? `<p><strong>Cancellation Reason:</strong> ${regularJob.cancellationReason}</p>`
              : ''
          }
        </div>
      `;
    }

    const alert = await this.alertController.create({
      header: 'Job Details',
      message,
      buttons: ['Close'],
    });

    await alert.present();
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'completed':
        return 'checkmark-done-outline';
      case 'cancelled':
        return 'close-circle-outline';
      default:
        return 'help-circle-outline';
    }
  }

  getJobTypeColor(jobType: string): string {
    return jobType === 'quick'
      ? 'bg-orange-100 text-orange-800'
      : 'bg-blue-100 text-blue-800';
  }

  getJobTypeIcon(jobType: string): string {
    return jobType === 'quick' ? 'flash-outline' : 'briefcase-outline';
  }

  getCategoryIcon(category: string): string {
    switch (category?.toLowerCase()) {
      case 'cleaning':
        return 'brush-outline';
      case 'plumbing':
        return 'water-outline';
      case 'electrical':
        return 'flash-outline';
      case 'gardening':
        return 'leaf-outline';
      case 'carpentry':
        return 'hammer-outline';
      case 'painting':
        return 'color-palette-outline';
      case 'appliance':
        return 'settings-outline';
      default:
        return 'construct-outline';
    }
  }

  formatCurrency(amount: number): string {
    return `₱${amount?.toLocaleString() || '0'}`;
  }

  getJobTitle(job: BookingData | QuickBookingData): string {
    const isQuickBooking = (job as any).jobType === 'quick';
    if (isQuickBooking) {
      const quickJob = job as QuickBookingData;
      return `${quickJob.categoryName} - ${quickJob.subService}`;
    } else {
      const regularJob = job as BookingData;
      return regularJob.title || regularJob.category || 'Untitled Job';
    }
  }

  getJobLocation(job: BookingData | QuickBookingData): string {
    const isQuickBooking = (job as any).jobType === 'quick';
    if (isQuickBooking) {
      const quickJob = job as QuickBookingData;
      return quickJob.location.address;
    } else {
      const regularJob = job as BookingData;
      return regularJob.locations?.[0]?.address || 'No location specified';
    }
  }

  getJobEarnings(job: BookingData | QuickBookingData): number {
    const isQuickBooking = (job as any).jobType === 'quick';
    if (isQuickBooking) {
      const quickJob = job as QuickBookingData;
      return quickJob.pricing.total || 0;
    } else {
      const regularJob = job as BookingData;
      return regularJob.total || 0;
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
      position: 'bottom',
    });
    await toast.present();
  }

  goBack() {
    this.router.navigate(['/worker/dashboard']);
  }

  refreshJobs() {
    this.loadJobHistory();
    this.showToast('Job history refreshed successfully', 'success');
  }

  // Statistics methods
  getCompletedCount(): number {
    return this.allJobs.filter((job) => job.status === 'completed').length;
  }

  getCancelledCount(): number {
    return this.allJobs.filter((job) => job.status === 'cancelled').length;
  }

  getTotalEarnings(): number {
    return this.allJobs
      .filter((job) => job.status === 'completed')
      .reduce((total, job) => total + this.getJobEarnings(job), 0);
  }

  getQuickBookingsCount(): number {
    return this.allJobs.filter((job) => (job as any).jobType === 'quick')
      .length;
  }

  getRegularBookingsCount(): number {
    return this.allJobs.filter((job) => (job as any).jobType === 'regular')
      .length;
  }

  // Helper methods for template
  getJobCategory(job: BookingData | QuickBookingData): string {
    if ('categoryName' in job) {
      return (job as QuickBookingData).categoryName;
    }
    return (job as BookingData).category || (job as BookingData).neededService || 'Service';
  }

  getJobType(job: BookingData | QuickBookingData): string {
    if ('categoryName' in job) {
      return 'quick';
    }
    return 'regular';
  }

  getJobRating(job: BookingData | QuickBookingData): number | null {
    if ('clientRating' in job) {
      return (job as QuickBookingData).clientRating || null;
    }
    return (job as any).rating || null;
  }

  getJobReview(job: BookingData | QuickBookingData): string | null {
    if ('clientReview' in job) {
      return (job as QuickBookingData).clientReview || null;
    }
    return (job as any).review || null;
  }
}
