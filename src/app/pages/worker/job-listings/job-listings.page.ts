import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import {
  ToastController,
  LoadingController,
  AlertController,
  ModalController,
} from '@ionic/angular';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { BookingService, BookingData, NewBookingData } from '../../../services/booking.service';
import { WorkerService, WorkerProfile } from '../../../services/worker.service';
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
  getDocs,
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
  workerProfile: WorkerProfile | null = null;
  bookingRequests: (BookingData | NewBookingData)[] = [];
  isLoading = true;
  error: string | null = null;

  // Statistics
  totalRequests = 0;
  pendingRequests = 0;
  todayRequests = 0;

  // Subscriptions
  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private authService: AuthService,
    private bookingService: BookingService,
    private workerService: WorkerService,
    private firestore: Firestore,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private modalController: ModalController
  ) {}

  ngOnInit() {
    // Subscribe to user profile
    this.subscriptions.push(
      this.authService.userProfile$.subscribe((profile) => {
        this.userProfile = profile;
        if (profile?.uid) {
          this.loadWorkerProfile();
          this.loadBookingRequests();
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  async loadWorkerProfile() {
    if (!this.userProfile?.uid) return;

    try {
      this.workerProfile = await this.workerService.getCompleteWorkerProfile(this.userProfile.uid);
    } catch (error) {
      console.error('Error loading worker profile:', error);
    }
  }

  async loadBookingRequests() {
    if (!this.userProfile?.uid || !this.workerProfile) return;

    try {
      this.isLoading = true;
      this.error = null;

      // Get all pending bookings that match worker's skills
      const bookingsRef = collection(this.firestore, 'bookings');
      const q = query(
        bookingsRef,
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );

      // Set up real-time listener
      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const requests: (BookingData | NewBookingData)[] = [];

        // Process each booking and fetch client details
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          
          // Convert Firestore Timestamps
          const createdAt = data['createdAt'] instanceof Timestamp
            ? data['createdAt'].toDate()
            : new Date(data['createdAt']);

          // Fetch client details from users collection
          let clientDetails = null;
          if (data['clientId']) {
            try {
              clientDetails = await this.authService.getUserProfile(data['clientId']);
            } catch (error) {
              console.warn('Could not fetch client details for booking:', docSnap.id, error);
            }
          }

          const request = {
            id: docSnap.id,
            ...data,
            createdAt,
            isProcessing: false,
            clientDetails: clientDetails // Add client details to the booking
          } as (BookingData | NewBookingData) & { isProcessing: boolean; clientDetails: any };

          requests.push(request);
        }

        this.bookingRequests = requests;
        this.updateStatistics();
        this.isLoading = false;
      }, (error) => {
        console.error('Error loading booking requests:', error);
        this.error = 'Failed to load booking requests';
        this.isLoading = false;
      });

      // Store unsubscribe function
      this.subscriptions.push({ unsubscribe } as any);

    } catch (error) {
      console.error('Error setting up booking requests listener:', error);
      this.error = 'Failed to load booking requests';
      this.isLoading = false;
    }
  }

  private updateStatistics() {
    this.totalRequests = this.bookingRequests.length;
    this.pendingRequests = this.bookingRequests.filter(req => req.status === 'pending').length;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    this.todayRequests = this.bookingRequests.filter(req => {
      const reqDate = new Date(req.createdAt);
      reqDate.setHours(0, 0, 0, 0);
      return reqDate.getTime() === today.getTime();
    }).length;
  }

  async approveRequest(request: (BookingData | NewBookingData) & { isProcessing?: boolean }) {
    if (!this.userProfile?.uid || !this.workerProfile) {
      this.showToast('Unable to approve request', 'danger');
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Approving request...',
    });
    await loading.present();

    try {
      request.isProcessing = true;

      // Update booking status to accepted and assign worker
      const bookingRef = doc(this.firestore, 'bookings', (request as any).id);
      await updateDoc(bookingRef, {
        status: 'accepted',
        workerId: this.userProfile.uid,
        workerName: this.userProfile.fullName,
        acceptedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      this.showToast('Request approved successfully!', 'success');
    } catch (error) {
      console.error('Error approving request:', error);
      this.showToast('Failed to approve request', 'danger');
    } finally {
      request.isProcessing = false;
      await loading.dismiss();
    }
  }

  async rejectRequest(request: (BookingData | NewBookingData) & { isProcessing?: boolean }) {
    const alert = await this.alertController.create({
      header: 'Reject Request',
      message: 'Are you sure you want to reject this job request?',
      inputs: [
        {
          name: 'reason',
          type: 'textarea',
          placeholder: 'Reason for rejection (optional)',
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Reject',
          handler: async (data) => {
            await this.performRejectRequest(request, data.reason);
          },
        },
      ],
    });

    await alert.present();
  }

  private async performRejectRequest(request: (BookingData | NewBookingData) & { isProcessing?: boolean }, reason?: string) {
    const loading = await this.loadingController.create({
      message: 'Rejecting request...',
    });
    await loading.present();

    try {
      request.isProcessing = true;

      // For now, we'll just remove it from pending (could be implemented differently)
      // In a real app, you might want to track rejections
      const bookingRef = doc(this.firestore, 'bookings', (request as any).id);
      await updateDoc(bookingRef, {
        status: 'cancelled',
        rejectedBy: this.userProfile?.uid,
        rejectionReason: reason || 'Rejected by worker',
        rejectedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      this.showToast('Request rejected', 'success');
    } catch (error) {
      console.error('Error rejecting request:', error);
      this.showToast('Failed to reject request', 'danger');
    } finally {
      request.isProcessing = false;
      await loading.dismiss();
    }
  }

  viewRequestDetails(request: BookingData | NewBookingData) {
    // Navigate to booking details page
    this.router.navigate(['/pages/worker/job-request-details', (request as any).id]);
  }

  async refreshBookingRequests() {
    await this.loadBookingRequests();
    this.showToast('Requests refreshed', 'success');
  }

  goBack() {
    this.router.navigate(['/worker/dashboard']);
  }

  trackByBookingId(index: number, item: BookingData | NewBookingData): string {
    return (item as any).id || index.toString();
  }

  // Helper methods for displaying booking data
  getBookingTitle(booking: BookingData | NewBookingData): string {
    if ('title' in booking) return (booking as any).title || 'Service Request';
    if ('categoryName' in booking) return (booking as any).categoryName || 'Service Request';
    return 'Service Request';
  }

  getBookingCategory(booking: BookingData | NewBookingData): string {
    if ('category' in booking) return (booking as any).category || 'General Service';
    if ('categoryName' in booking) return (booking as any).categoryName || 'General Service';
    return 'General Service';
  }

  getClientName(booking: BookingData | NewBookingData): string {
    // First check if we have client details from the users collection
    const bookingWithClient = booking as any;
    if (bookingWithClient.clientDetails) {
      const client = bookingWithClient.clientDetails;
      if (client.fullName) return client.fullName;
      if (client.firstName && client.lastName) return `${client.firstName} ${client.lastName}`;
      if (client.firstName) return client.firstName;
      if (client.email) return client.email;
    }
    
    // Fallback to booking data fields
    if ('clientName' in booking) return (booking as any).clientName || 'Client';
    if ('userName' in booking) return (booking as any).userName || 'Client';
    return 'Client';
  }

  getBookingLocation(booking: BookingData | NewBookingData): string {
    if ('location' in booking && (booking as any).location) {
      return (booking as any).location.address || 'Location not specified';
    }
    if ('locations' in booking && (booking as any).locations && (booking as any).locations.length > 0) {
      return (booking as any).locations[0].address || 'Location not specified';
    }
    return 'Location not specified';
  }

  getBookingDate(booking: BookingData | NewBookingData): string {
    if ('schedule' in booking && booking.schedule) {
      return booking.schedule.date || 'Not scheduled';
    }
    return 'Not scheduled';
  }

  getBookingTime(booking: BookingData | NewBookingData): string {
    if ('schedule' in booking && booking.schedule) {
      return booking.schedule.time || 'Not scheduled';
    }
    return 'Not scheduled';
  }

  getBookingPrice(booking: BookingData | NewBookingData): number {
    if ('pricing' in booking && (booking as any).pricing) {
      return (booking as any).pricing.total || (booking as any).pricing.basePrice || 0;
    }
    if ('price' in booking) return (booking as any).price || 0;
    if ('total' in booking) return (booking as any).total || 0;
    return 0;
  }

  getBookingDescription(booking: BookingData | NewBookingData): string {
    if ('description' in booking) return booking.description || '';
    if ('notes' in booking) return booking.notes || '';
    return '';
  }

  isRequestProcessing(request: BookingData | NewBookingData): boolean {
    return (request as any).isProcessing || false;
  }

  getClientEmail(booking: BookingData | NewBookingData): string {
    const bookingWithClient = booking as any;
    if (bookingWithClient.clientDetails && bookingWithClient.clientDetails.email) {
      return bookingWithClient.clientDetails.email;
    }
    // Fallback to booking data
    if ('clientEmail' in booking) return (booking as any).clientEmail || '';
    return '';
  }

  getClientPhone(booking: BookingData | NewBookingData): string {
    const bookingWithClient = booking as any;
    if (bookingWithClient.clientDetails && bookingWithClient.clientDetails.phoneNumber) {
      return bookingWithClient.clientDetails.phoneNumber;
    }
    // Fallback to booking data
    if ('clientPhone' in booking) return (booking as any).clientPhone || '';
    return '';
  }

  getClientProfileImage(booking: BookingData | NewBookingData): string {
    const bookingWithClient = booking as any;
    if (bookingWithClient.clientDetails && bookingWithClient.clientDetails.profileImage) {
      return bookingWithClient.clientDetails.profileImage;
    }
    return ''; // Return empty string for default avatar
  }

  getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger' = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    toast.present();
  }
}