import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import {
  ToastController,
  LoadingController,
  AlertController,
  ModalController,
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
  doc,
  updateDoc,
  Timestamp,
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-job-listings',
  templateUrl: './job-listings.page.html',
  styleUrls: ['./job-listings.page.scss'],
  standalone: false,
})
export class JobListingsPage implements OnInit, OnDestroy {
  userProfile: UserProfile | null = null;
  allJobs: BookingData[] = [];
  filteredJobs: BookingData[] = [];
  isLoading = true;
  error: string | null = null;

  // Filter options
  selectedStatus: string = 'all';
  searchTerm: string = '';

  statusOptions = [
    { label: 'All Jobs', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Accepted', value: 'accepted' },
    { label: 'On the Way', value: 'on-the-way' },
    { label: 'In Progress', value: 'in-progress' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
  ];

  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private authService: AuthService,
    private bookingService: BookingService,
    private firestore: Firestore,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private modalController: ModalController
  ) {}

  ngOnInit() {
    this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile?.uid) {
        this.loadAllJobs();
      }
    });
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  async loadAllJobs() {
    if (!this.userProfile?.uid) return;

    try {
      this.isLoading = true;
      this.error = null;

      // Set up real-time listener for bookings collection
      const bookingsRef = collection(this.firestore, 'bookings');
      const q = query(bookingsRef, orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const jobs: BookingData[] = [];

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

          const job: BookingData = {
            id: docSnap.id,
            ...data,
            createdAt,
            updatedAt,
            completedAt,
            cancelledAt,
            reviewedAt,
          } as BookingData;

          jobs.push(job);
        });

        this.allJobs = jobs;
        this.applyFilters();
        this.isLoading = false;
      });

      // Store subscription for cleanup
      this.subscriptions.push({ unsubscribe } as any);
    } catch (error) {
      console.error('Error loading jobs:', error);
      this.error = 'Failed to load jobs';
      this.isLoading = false;
      this.showToast('Failed to load jobs', 'danger');
    }
  }

  applyFilters() {
    let filtered = [...this.allJobs];

    // Apply status filter
    if (this.selectedStatus !== 'all') {
      filtered = filtered.filter((job) => job.status === this.selectedStatus);
    }

    // Apply search filter
    if (this.searchTerm.trim()) {
      const searchLower = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(
        (job) =>
          job.title?.toLowerCase().includes(searchLower) ||
          job.description?.toLowerCase().includes(searchLower) ||
          job.category?.toLowerCase().includes(searchLower) ||
          job.locations?.some((loc) =>
            loc.address?.toLowerCase().includes(searchLower)
          )
      );
    }

    this.filteredJobs = filtered;
  }

  onStatusFilterChange() {
    this.applyFilters();
  }

  onSearchChange() {
    this.applyFilters();
  }

  clearSearch() {
    this.searchTerm = '';
    this.applyFilters();
  }

  async acceptJob(job: BookingData) {
    if (!job.id || !this.userProfile?.uid) return;

    const alert = await this.alertController.create({
      header: 'Accept Job',
      message: `Do you want to accept this job: "${job.title}"?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Accept',
          handler: async () => {
            await this.performAcceptJob(job);
          },
        },
      ],
    });

    await alert.present();
  }

  async performAcceptJob(job: BookingData) {
    if (!job.id || !this.userProfile?.uid) return;

    try {
      const loading = await this.loadingController.create({
        message: 'Accepting job...',
      });
      await loading.present();

      const jobRef = doc(this.firestore, 'bookings', job.id);
      await updateDoc(jobRef, {
        status: 'accepted',
        workerId: this.userProfile.uid,
        workerName: this.userProfile.fullName,
        workerPhone: this.userProfile.phone || '',
        updatedAt: new Date(),
      });

      await loading.dismiss();
      this.showToast('Job accepted successfully!', 'success');
    } catch (error) {
      console.error('Error accepting job:', error);
      this.showToast('Failed to accept job', 'danger');
    }
  }

  async viewJobDetails(job: BookingData) {
    const alert = await this.alertController.create({
      header: 'Job Details',
      message: `
        <div style="text-align: left;">
          <p><strong>Title:</strong> ${job.title}</p>
          <p><strong>Category:</strong> ${job.category}</p>
          <p><strong>Description:</strong> ${job.description}</p>
          <p><strong>Status:</strong> ${job.status}</p>
          <p><strong>Price Type:</strong> ${job.priceType}</p>
          <p><strong>Price:</strong> ₱${job.price?.toLocaleString()}</p>
          <p><strong>Total:</strong> ₱${job.total?.toLocaleString()}</p>
          <p><strong>Created:</strong> ${job.createdAt.toLocaleDateString()} ${job.createdAt.toLocaleTimeString()}</p>
          ${
            job.schedule
              ? `<p><strong>Scheduled:</strong> ${job.schedule.date} at ${job.schedule.time}</p>`
              : ''
          }
          ${
            job.workerName
              ? `<p><strong>Assigned Worker:</strong> ${job.workerName}</p>`
              : ''
          }
        </div>
      `,
      buttons: ['Close'],
    });

    await alert.present();
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'accepted':
        return 'bg-blue-100 text-blue-800';
      case 'on-the-way':
        return 'bg-indigo-100 text-indigo-800';
      case 'in-progress':
        return 'bg-orange-100 text-orange-800';
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
      case 'pending':
        return 'hourglass-outline';
      case 'accepted':
        return 'checkmark-circle-outline';
      case 'on-the-way':
        return 'car-outline';
      case 'in-progress':
        return 'build-outline';
      case 'completed':
        return 'checkmark-done-outline';
      case 'cancelled':
        return 'close-circle-outline';
      default:
        return 'help-circle-outline';
    }
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

  canAcceptJob(job: BookingData): boolean {
    return job.status === 'pending' && !job.workerId;
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
    this.loadAllJobs();
    this.showToast('Jobs refreshed successfully', 'success');
  }
}
