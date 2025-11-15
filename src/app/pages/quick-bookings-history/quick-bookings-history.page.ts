import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  ToastController,
  LoadingController,
  AlertController,
} from '@ionic/angular';
import { AuthService, UserProfile } from '../../services/auth.service';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from '@angular/fire/firestore';

export interface QuickBookingData {
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
    transportFee?: number;
  };
  finalPricing?: {
    basePrice: number;
    serviceCharge: number;
    transportFee: number;
    total: number;
    duration?: number;
  };
  // Fields for regular bookings with calculatedPayment
  calculatedPayment?: {
    actualDuration: string; // Format: "HH:MM:SS" or "MM:SS"
    baseAmount: number;
    billingDuration: string;
    hourlyRate: number;
    serviceFee: number;
    totalAmount: number;
    totalHours: number;
    transportationFee: number;
  };
  estimatedDuration: number;
  jobTimer?: {
    startTime?: Date;
    endTime?: Date;
    duration?: number; // Actual duration in minutes
  };
  status:
    | 'searching'
    | 'accepted'
    | 'on-the-way'
    | 'in-progress'
    | 'completed'
    | 'cancelled'
    | 'payment-confirmed';
  assignedWorker: string | null;
  workerName?: string;
  workerId?: string;
  createdAt: Date;
  scheduledDate?: Date;
  scheduledTime?: string;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  // For identifying source
  sourceType?: 'quick' | 'regular';
  bookingType?: string;
  isQuickBooking?: boolean;
}

@Component({
  selector: 'app-quick-bookings-history',
  templateUrl: './quick-bookings-history.page.html',
  styleUrls: ['./quick-bookings-history.page.scss'],
  standalone: false,
})
export class QuickBookingsHistoryPage implements OnInit {
  userProfile: UserProfile | null = null;
  quickBookings: QuickBookingData[] = [];
  isLoading = true;
  error: string | null = null;

  constructor(
    private router: Router,
    private authService: AuthService,
    private firestore: Firestore,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile?.uid) {
        this.loadQuickBookings();
      }
    });
  }

  async loadQuickBookings() {
    if (!this.userProfile?.uid) return;

    try {
      this.isLoading = true;
      this.error = null;

      // Fetch quick bookings from Firestore
      const quickBookingsRef = collection(this.firestore, 'quickbookings');
      const quickBookingsQuery = query(
        quickBookingsRef,
        where('clientId', '==', this.userProfile.uid),
        orderBy('createdAt', 'desc')
      );

      // Also fetch regular bookings to get calculatedPayment.actualDuration
      const regularBookingsRef = collection(this.firestore, 'bookings');
      const regularBookingsQuery = query(
        regularBookingsRef,
        where('clientId', '==', this.userProfile.uid),
        orderBy('createdAt', 'desc')
      );

      const [quickBookingsSnapshot, regularBookingsSnapshot] =
        await Promise.all([
          getDocs(quickBookingsQuery),
          getDocs(regularBookingsQuery),
        ]);

      this.quickBookings = [];

      // Process quick bookings
      quickBookingsSnapshot.forEach((doc) => {
        const data = doc.data();
        this.processBookingData(doc, data, 'quick');
      });

      // Process regular bookings (they might be displayed in quick booking history if they're quick-type)
      regularBookingsSnapshot.forEach((doc) => {
        const data = doc.data();
        // Only include if it's a quick-type booking or has quick booking characteristics
        if (data['bookingType'] === 'quick' || data['isQuickBooking']) {
          this.processBookingData(doc, data, 'regular');
        }
      });

      // Sort all bookings by creation date
      this.quickBookings.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      if (this.quickBookings.length === 0) {
        this.error = 'No quick bookings found. Start by using quick booking!';
      }
    } catch (error) {
      console.error('Error loading quick bookings:', error);
      this.error = 'Failed to load quick bookings. Please try again.';
      this.showToast('Failed to load quick bookings', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  private processBookingData(
    doc: any,
    data: any,
    sourceType: 'quick' | 'regular'
  ) {
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

    // Handle jobTimer data if present
    let jobTimer = undefined;
    if (data['jobTimer']) {
      const timerData = data['jobTimer'];

      const startTime =
        timerData.startTime instanceof Timestamp
          ? timerData.startTime.toDate()
          : timerData.startTime
          ? new Date(timerData.startTime)
          : undefined;

      const endTime =
        timerData.endTime instanceof Timestamp
          ? timerData.endTime.toDate()
          : timerData.endTime
          ? new Date(timerData.endTime)
          : undefined;

      // Calculate duration from start and end times if both are available
      let calculatedDuration = timerData.duration || 0;
      if (startTime && endTime) {
        const durationMs = endTime.getTime() - startTime.getTime();
        calculatedDuration = Math.round(durationMs / (1000 * 60)); // Convert to minutes
        console.log('Calculated duration for booking:', {
          bookingId: doc.id,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          durationMs,
          durationMinutes: calculatedDuration,
        });
      } else if (timerData.duration) {
        console.log('Using stored duration for booking:', {
          bookingId: doc.id,
          storedDuration: timerData.duration,
        });
      }

      jobTimer = {
        startTime,
        endTime,
        duration: calculatedDuration,
      };
    }

    // Handle calculatedPayment.actualDuration for regular bookings
    let actualDurationFromPayment = 0;
    if (sourceType === 'regular' && data['calculatedPayment']?.actualDuration) {
      const actualDuration = data['calculatedPayment'].actualDuration;

      // Parse duration string (format: "HH:MM:SS" or "MM:SS")
      if (typeof actualDuration === 'string') {
        const parts = actualDuration.split(':');
        if (parts.length === 3) {
          // Format: "HH:MM:SS"
          const hours = parseInt(parts[0]) || 0;
          const minutes = parseInt(parts[1]) || 0;
          const seconds = parseInt(parts[2]) || 0;
          actualDurationFromPayment =
            hours * 60 + minutes + (seconds > 0 ? 1 : 0); // Round up seconds to minutes
        } else if (parts.length === 2) {
          // Format: "MM:SS"
          const minutes = parseInt(parts[0]) || 0;
          const seconds = parseInt(parts[1]) || 0;
          actualDurationFromPayment = minutes + (seconds > 0 ? 1 : 0); // Round up seconds to minutes
        }

        console.log('Parsed actualDuration from calculatedPayment:', {
          bookingId: doc.id,
          rawDuration: actualDuration,
          parsedMinutes: actualDurationFromPayment,
        });
      }

      // Update jobTimer with actual duration if we have it
      if (actualDurationFromPayment > 0) {
        if (!jobTimer) {
          jobTimer = {
            startTime: undefined,
            endTime: undefined,
            duration: actualDurationFromPayment,
          };
        } else {
          // Use the actual duration from calculatedPayment as it's more accurate
          jobTimer.duration = actualDurationFromPayment;
        }
      }
    }

    this.quickBookings.push({
      id: doc.id,
      ...data,
      createdAt,
      completedAt,
      cancelledAt,
      jobTimer,
      sourceType, // Add source type for debugging
    } as QuickBookingData & { sourceType: string });
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
    this.router.navigate(['/pages/client/dashboard']);
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'searching':
        return 'bg-blue-100 text-blue-800';
      case 'accepted':
        return 'bg-indigo-100 text-indigo-800';
      case 'on-the-way':
        return 'bg-purple-100 text-purple-800';
      case 'in-progress':
        return 'bg-orange-100 text-orange-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'payment-confirmed':
        return 'bg-emerald-100 text-emerald-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'searching':
        return 'search-outline';
      case 'accepted':
        return 'checkmark-circle-outline';
      case 'on-the-way':
        return 'car-outline';
      case 'in-progress':
        return 'build-outline';
      case 'completed':
        return 'checkmark-done-outline';
      case 'payment-confirmed':
        return 'card-outline';
      case 'cancelled':
        return 'close-circle-outline';
      default:
        return 'help-circle-outline';
    }
  }

  getCategoryIcon(categoryId: string): string {
    switch (categoryId) {
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

  getCategoryColor(categoryId: string): string {
    switch (categoryId) {
      case 'cleaning':
        return 'bg-blue-100 text-blue-600';
      case 'plumbing':
        return 'bg-indigo-100 text-indigo-600';
      case 'electrical':
        return 'bg-yellow-100 text-yellow-600';
      case 'gardening':
        return 'bg-green-100 text-green-600';
      case 'carpentry':
        return 'bg-amber-100 text-amber-600';
      case 'painting':
        return 'bg-purple-100 text-purple-600';
      case 'appliance':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  }

  formatCurrency(amount: number): string {
    return `₱${amount.toLocaleString()}`;
  }

  formatDuration(minutes: number): string {
    // Handle invalid or zero values
    if (!minutes || minutes <= 0) {
      return 'N/A';
    }

    // Round to nearest minute to avoid decimal issues
    const roundedMinutes = Math.round(minutes);

    if (roundedMinutes < 60) {
      return `${roundedMinutes} min${roundedMinutes !== 1 ? 's' : ''}`;
    }

    const hours = Math.floor(roundedMinutes / 60);
    const remainingMinutes = roundedMinutes % 60;

    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    } else {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Get the actual duration for a booking, prioritizing calculatedPayment.actualDuration
   */
  getActualDuration(booking: QuickBookingData): number {
    // First priority: calculatedPayment.actualDuration from regular bookings
    if (booking.calculatedPayment?.actualDuration) {
      const actualDuration = booking.calculatedPayment.actualDuration;
      console.log(
        'Found calculatedPayment.actualDuration:',
        actualDuration,
        'for booking:',
        booking.id
      );

      // Parse duration string (format: "HH:MM:SS" or "MM:SS")
      if (typeof actualDuration === 'string') {
        const parts = actualDuration.split(':');
        if (parts.length === 3) {
          // Format: "HH:MM:SS" - e.g., "00:00:01" = 1 second
          const hours = parseInt(parts[0]) || 0;
          const minutes = parseInt(parts[1]) || 0;
          const seconds = parseInt(parts[2]) || 0;

          // Convert to total seconds first, then to minutes with precision
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;
          const totalMinutes = totalSeconds / 60;

          console.log('Parsed HH:MM:SS:', {
            hours,
            minutes,
            seconds,
            totalSeconds,
            totalMinutes,
          });

          // Return precise minutes, but ensure minimum of 1 minute for display if duration exists
          if (totalMinutes > 0) {
            return totalMinutes < 1 ? 1 : Math.round(totalMinutes);
          }
        } else if (parts.length === 2) {
          // Format: "MM:SS"
          const minutes = parseInt(parts[0]) || 0;
          const seconds = parseInt(parts[1]) || 0;
          const totalMinutes = minutes + seconds / 60;
          console.log('Parsed MM:SS:', { minutes, seconds, totalMinutes });
          if (totalMinutes > 0) {
            return totalMinutes < 1 ? 1 : Math.round(totalMinutes);
          }
        }
      }
    }

    // For completed bookings, prefer actual duration from jobTimer
    if (
      booking.status === 'completed' ||
      booking.status === 'payment-confirmed'
    ) {
      if (booking.jobTimer?.duration && booking.jobTimer.duration > 0) {
        return booking.jobTimer.duration;
      }
      // Calculate from start/end time if duration is not available but times are
      if (booking.jobTimer?.startTime && booking.jobTimer?.endTime) {
        const durationMs =
          booking.jobTimer.endTime.getTime() -
          booking.jobTimer.startTime.getTime();
        const durationMinutes = Math.round(durationMs / (1000 * 60));
        if (durationMinutes > 0) {
          return durationMinutes;
        }
      }
      // Fallback to finalPricing duration if available
      if (booking.finalPricing?.duration && booking.finalPricing.duration > 0) {
        return booking.finalPricing.duration;
      }
    }

    // For other statuses or when no actual duration is available, use estimated
    // Ensure we return a valid number
    return booking.estimatedDuration && booking.estimatedDuration > 0
      ? booking.estimatedDuration
      : 30; // Default to 30 minutes if no duration is available
  }

  /**
   * Get the final price for display, preferring finalPricing over initial pricing
   */
  getFinalPrice(booking: QuickBookingData): number {
    // For completed bookings, prefer final pricing
    if (
      booking.status === 'completed' ||
      booking.status === 'payment-confirmed'
    ) {
      if (booking.finalPricing?.total && booking.finalPricing.total > 0) {
        return booking.finalPricing.total;
      }
    }
    // Fallback to initial pricing
    return booking.pricing?.total || 0;
  }

  /**
   * Check if booking has actual duration data
   */
  hasActualDuration(booking: QuickBookingData): boolean {
    // Check if we have calculatedPayment.actualDuration (highest priority)
    if (booking.calculatedPayment?.actualDuration) {
      const actualDuration = booking.calculatedPayment.actualDuration;
      if (typeof actualDuration === 'string' && actualDuration !== '00:00:00') {
        const parts = actualDuration.split(':');
        if (parts.length >= 2) {
          const totalSeconds = parts.reduce((acc, part, index) => {
            const value = parseInt(part) || 0;
            return acc + value * Math.pow(60, parts.length - 1 - index);
          }, 0);
          return totalSeconds > 0;
        }
      }
    }

    // Check if we have actual timer duration
    if (booking.jobTimer?.duration && booking.jobTimer.duration > 0) {
      return true;
    }
    // Check if we can calculate duration from start/end times
    if (booking.jobTimer?.startTime && booking.jobTimer?.endTime) {
      const durationMs =
        booking.jobTimer.endTime.getTime() -
        booking.jobTimer.startTime.getTime();
      return durationMs > 0;
    }
    // Check if we have final pricing duration
    if (booking.finalPricing?.duration && booking.finalPricing.duration > 0) {
      return true;
    }
    return false;
  }

  /**
   * Get the source of duration data for debugging
   */
  getDurationSource(booking: QuickBookingData): string {
    if (booking.calculatedPayment?.actualDuration) {
      return 'Payment';
    }
    if (booking.jobTimer?.duration && booking.jobTimer.duration > 0) {
      return 'Timer';
    }
    if (booking.jobTimer?.startTime && booking.jobTimer?.endTime) {
      return 'Calculated';
    }
    if (booking.finalPricing?.duration && booking.finalPricing.duration > 0) {
      return 'Final';
    }
    return 'Estimated';
  }

  async viewBookingDetails(booking: QuickBookingData) {
    if (!booking.id) {
      this.showToast('Booking details not available', 'warning');
      return;
    }

    // Check if user is authenticated
    if (!this.userProfile?.uid) {
      console.warn(
        '⚠️ User not authenticated, cannot navigate to worker-found'
      );
      this.showToast('Please log in to view booking details', 'warning');
      return;
    }

    console.log(
      '🔍 Navigating to booking details with booking ID:',
      booking.id
    );
    console.log('📋 Booking data:', booking);
    console.log('👤 Current user:', this.userProfile.uid);

    try {
      // Navigate to booking progress page (consistent with notifications)
      console.log('Navigating to booking progress for quick booking:', {
        bookingId: booking.id,
        status: booking.status,
      });

      let navigationResult = await this.router.navigate([
        '/client/booking-progress',
        booking.id,
      ]);

      console.log('✅ Primary navigation result:', navigationResult);

      // If primary navigation fails, try fallback to worker-found for active bookings
      if (!navigationResult) {
        console.log('🔄 Primary navigation failed, trying fallback...');

        // Use worker-found as fallback for accepted/in-progress bookings
        if (
          booking.status === 'accepted' ||
          booking.status === 'in-progress' ||
          booking.status === 'on-the-way'
        ) {
          navigationResult = await this.router.navigate(
            ['/client/worker-found', booking.id],
            {
              queryParams: {
                fromHistory: 'true',
              },
            }
          );
        } else {
          // For other statuses, try with query params
          navigationResult = await this.router.navigate(
            ['/client/booking-progress'],
            {
              queryParams: {
                bookingId: booking.id,
                fromHistory: 'true',
              },
            }
          );
        }
        console.log('✅ Fallback navigation result:', navigationResult);
      }

      if (!navigationResult) {
        console.warn('⚠️ Both navigation attempts failed');
        this.showToast(
          'Unable to navigate to booking details. Please try again.',
          'warning'
        );
      }
    } catch (error) {
      console.error('❌ Navigation error:', error);
      this.showToast('Navigation failed. Please try again.', 'danger');
    }
  }

  async rebookService(booking: QuickBookingData) {
    // Navigate to quick booking with the same category
    this.router.navigate(['/client/select-category'], {
      queryParams: { type: 'quick', category: booking.categoryId },
    });
  }

  getCompletedCount(): number {
    return this.quickBookings.filter(
      (booking) =>
        booking.status === 'completed' || booking.status === 'payment-confirmed'
    ).length;
  }

  getActiveCount(): number {
    return this.quickBookings.filter((booking) =>
      ['searching', 'accepted', 'on-the-way', 'in-progress'].includes(
        booking.status
      )
    ).length;
  }

  getCancelledCount(): number {
    return this.quickBookings.filter(
      (booking) => booking.status === 'cancelled'
    ).length;
  }
}
