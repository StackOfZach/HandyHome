import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from '@angular/fire/firestore';
import { AuthService } from '../../../services/auth.service';

interface BookingHistoryItem {
  id: string;
  clientId: string;
  workerId?: string;
  workerName?: string;
  neededService: string;
  scheduleDate: any;
  priceRange: number;
  minBudget?: number;
  maxBudget?: number;
  status: 'draft' | 'pending' | 'accepted' | 'completed' | 'cancelled';
  createdAt: any;
  updatedAt: any;
  calculatedPayment?: {
    baseAmount?: number;
    totalHours?: number;
    hourlyRate?: number;
    serviceFee?: number;
    transportationFee?: number;
    totalAmount?: number;
    actualDuration?: string;
    billingDuration?: string;
  };
}

@Component({
  selector: 'app-booking-history',
  templateUrl: './booking-history.page.html',
  styleUrls: ['./booking-history.page.scss'],
  standalone: false,
})
export class BookingHistoryPage implements OnInit {
  bookings: BookingHistoryItem[] = [];
  filteredBookings: BookingHistoryItem[] = [];
  isLoading = true;
  currentUser: any = null;
  selectedFilter = 'all';
  searchQuery = '';

  filterOptions = [
    { value: 'all', label: 'All Bookings' },
    { value: 'pending', label: 'Pending' },
    { value: 'accepted', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  constructor(
    private router: Router,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private firestore: Firestore,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();
    if (this.currentUser) {
      await this.loadBookingHistory();
    }
  }

  async loadBookingHistory() {
    if (!this.currentUser) return;

    this.isLoading = true;

    try {
      const bookingsQuery = query(
        collection(this.firestore, 'bookings'),
        where('clientId', '==', this.currentUser.uid),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(bookingsQuery);
      this.bookings = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        this.bookings.push({
          id: doc.id,
          ...data,
        } as BookingHistoryItem);
      });

      this.applyFilter();
    } catch (error) {
      console.error('Error loading booking history:', error);

      const toast = await this.toastController.create({
        message: 'Error loading booking history. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    } finally {
      this.isLoading = false;
    }
  }

  applyFilter() {
    let filtered = [...this.bookings];

    // Apply status filter
    if (this.selectedFilter !== 'all') {
      filtered = filtered.filter(
        (booking) => booking.status === this.selectedFilter
      );
    }

    // Apply search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (booking) =>
          booking.neededService.toLowerCase().includes(query) ||
          booking.workerName?.toLowerCase().includes(query) ||
          booking.id.toLowerCase().includes(query)
      );
    }

    this.filteredBookings = filtered;
  }

  onFilterChange() {
    this.applyFilter();
  }

  onSearchChange() {
    this.applyFilter();
  }

  clearSearch() {
    this.searchQuery = '';
    this.applyFilter();
  }

  viewBookingDetails(booking: BookingHistoryItem) {
    if (booking.status === 'pending' || booking.status === 'accepted') {
      // Navigate to booking progress page for active bookings
      this.router.navigate(['/client/booking-progress', booking.id]);
    } else {
      // For completed/cancelled bookings, you could navigate to a different details page
      console.log('View details for booking:', booking.id);
    }
  }

  async refreshBookings(event: any) {
    await this.loadBookingHistory();
    event.target.complete();
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'draft':
        return 'light';
      case 'pending':
        return 'warning';
      case 'accepted':
        return 'success';
      case 'completed':
        return 'primary';
      case 'cancelled':
        return 'danger';
      default:
        return 'medium';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'draft':
        return 'flaticon-document';
      case 'pending':
        return 'flaticon-clock';
      case 'accepted':
        return 'flaticon-check-circle';
      case 'completed':
        return 'flaticon-completed';
      case 'cancelled':
        return 'flaticon-close-circle';
      default:
        return 'flaticon-help-circle';
    }
  }

  formatDate(timestamp: any): Date | null {
    try {
      if (!timestamp) {
        return null;
      }

      // If it's a Firestore timestamp
      if (timestamp?.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
      }

      // If it's already a Date
      if (timestamp instanceof Date) {
        return timestamp;
      }

      // If it's a string or number, try to convert
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      console.warn('Error formatting date:', error);
      return null;
    }
  }

  // Safe method to get formatted date string
  getFormattedDate(timestamp: any, format: 'full' | 'short' = 'full'): string {
    const date = this.formatDate(timestamp);
    if (!date) {
      return 'Not scheduled';
    }

    try {
      if (format === 'full') {
        return date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } else {
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      }
    } catch (error) {
      console.warn('Error formatting date string:', error);
      return 'Invalid date';
    }
  }

  createNewBooking() {
    this.router.navigate(['/client/book-service']);
  }

  goBack() {
    this.router.navigate(['/pages/client/dashboard']);
  }

  trackByBookingId(index: number, booking: BookingHistoryItem): string {
    return booking.id;
  }

  // Get the total price including service fee and transportation fee
  getTotalPrice(booking: BookingHistoryItem): string {
    // If booking has calculated payment (completed bookings), show the actual total
    if (booking.calculatedPayment?.totalAmount) {
      return `₱${booking.calculatedPayment.totalAmount.toLocaleString()}`;
    }

    // For pending/active bookings, calculate estimated total from base price
    let basePrice = 0;

    if (booking.minBudget && booking.maxBudget) {
      // Use average of min and max budget
      basePrice = (booking.minBudget + booking.maxBudget) / 2;
    } else if (booking.priceRange) {
      basePrice = booking.priceRange;
    } else {
      return 'Price TBD';
    }

    // Calculate estimated total with fees (10% service fee + ₱50 transportation)
    const serviceFee = basePrice * 0.1;
    const transportationFee = 50;
    const estimatedTotal = basePrice + serviceFee + transportationFee;

    return `₱${estimatedTotal.toLocaleString('en-US', {
      maximumFractionDigits: 0,
    })}`;
  }

  // Get price label to show whether it's actual or estimated
  getPriceLabel(booking: BookingHistoryItem): string {
    if (booking.calculatedPayment?.totalAmount) {
      return 'Total Paid';
    }
    return 'Est. Total';
  }
}
