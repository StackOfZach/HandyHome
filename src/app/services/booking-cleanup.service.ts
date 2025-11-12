import { Injectable } from '@angular/core';
import {
  Firestore,
  doc,
  deleteDoc,
  getDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';

export interface ActiveBooking {
  id: string;
  clientId: string;
  status: string;
  createdAt: Date;
  autoCleanupAt: Date;
}

@Injectable({
  providedIn: 'root',
})
export class BookingCleanupService {
  private readonly CLEANUP_TIMEOUT_MINUTES = 30;
  private readonly STORAGE_KEY = 'activeBookingTracking';
  private readonly PENDING_CLEANUP_KEY = 'pendingCleanup';

  constructor(private firestore: Firestore, private authService: AuthService) {
    this.setupCleanupListeners();
  }

  private setupCleanupListeners() {
    // Listen for app/browser close events
    window.addEventListener('beforeunload', (event) => {
      this.handleAppExit();
    });

    // Listen for app resume to cleanup any pending bookings
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.cleanupPendingBookings();
      }
    });

    // Listen for page focus to cleanup pending bookings
    window.addEventListener('focus', () => {
      this.cleanupPendingBookings();
    });

    // Cleanup on app initialization
    setTimeout(() => {
      this.cleanupPendingBookings();
      this.cleanupExpiredBookings();
    }, 1000);
  }

  /**
   * Register a booking for cleanup tracking
   */
  setActiveBooking(bookingId: string, clientId?: string) {
    try {
      const currentUser = this.authService.getCurrentUser();
      const activeBooking: ActiveBooking = {
        id: bookingId,
        clientId: clientId || currentUser?.uid || '',
        status: 'searching',
        createdAt: new Date(),
        autoCleanupAt: new Date(
          Date.now() + this.CLEANUP_TIMEOUT_MINUTES * 60 * 1000
        ),
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(activeBooking));
      console.log('📝 Tracking booking for cleanup:', bookingId);
    } catch (error) {
      console.error('Error setting active booking:', error);
    }
  }

  /**
   * Clear active booking tracking (called when user successfully books)
   */
  clearActiveBooking() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.PENDING_CLEANUP_KEY);
      console.log('✅ Cleared booking cleanup tracking');
    } catch (error) {
      console.error('Error clearing active booking:', error);
    }
  }

  /**
   * Get currently tracked booking
   */
  getActiveBooking(): ActiveBooking | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const booking = JSON.parse(stored);
        booking.createdAt = new Date(booking.createdAt);
        booking.autoCleanupAt = new Date(booking.autoCleanupAt);
        return booking;
      }
      return null;
    } catch (error) {
      console.error('Error getting active booking:', error);
      return null;
    }
  }

  /**
   * Handle app exit - mark booking for cleanup
   */
  private handleAppExit() {
    const activeBooking = this.getActiveBooking();
    if (activeBooking) {
      // Mark booking for cleanup on next app resume
      localStorage.setItem(this.PENDING_CLEANUP_KEY, activeBooking.id);
      console.log(
        '🚪 App exit detected, marked booking for cleanup:',
        activeBooking.id
      );
    }
  }

  /**
   * Cleanup any bookings marked for cleanup
   */
  private async cleanupPendingBookings() {
    try {
      const pendingBookingId = localStorage.getItem(this.PENDING_CLEANUP_KEY);
      if (pendingBookingId) {
        console.log(
          '🧹 Processing pending cleanup for booking:',
          pendingBookingId
        );
        await this.deleteBookingIfAbandoned(pendingBookingId);
        localStorage.removeItem(this.PENDING_CLEANUP_KEY);
      }

      // Also check if current active booking should be cleaned up
      const activeBooking = this.getActiveBooking();
      if (activeBooking && new Date() > activeBooking.autoCleanupAt) {
        console.log(
          '⏰ Auto-cleanup timeout reached for booking:',
          activeBooking.id
        );
        await this.deleteBookingIfAbandoned(activeBooking.id);
        this.clearActiveBooking();
      }
    } catch (error) {
      console.error('Error cleaning up pending bookings:', error);
    }
  }

  /**
   * Cleanup bookings that have expired
   */
  private async cleanupExpiredBookings() {
    const activeBooking = this.getActiveBooking();
    if (activeBooking && new Date() > activeBooking.autoCleanupAt) {
      console.log(
        '⏰ Cleanup timeout reached for active booking:',
        activeBooking.id
      );
      await this.deleteBookingIfAbandoned(activeBooking.id);
      this.clearActiveBooking();
    }
  }

  /**
   * Delete a booking if it's still in searching status and abandoned
   */
  private async deleteBookingIfAbandoned(bookingId: string): Promise<boolean> {
    try {
      console.log('🔍 Checking if booking should be cleaned up:', bookingId);

      const bookingRef = doc(this.firestore, 'bookings', bookingId);
      const bookingDoc = await getDoc(bookingRef);

      if (bookingDoc.exists()) {
        const data = bookingDoc.data();
        console.log(
          '📋 Booking status:',
          data['status'],
          'Assigned worker:',
          data['assignedWorker']
        );

        // Only delete if still in searching status and no worker assigned
        if (data['status'] === 'searching' && !data['assignedWorker']) {
          await deleteDoc(bookingRef);
          console.log(
            '🗑️ Successfully cleaned up abandoned booking:',
            bookingId
          );
          return true;
        } else {
          console.log(
            '✋ Booking not abandoned (status changed or worker assigned), keeping it'
          );
          return false;
        }
      } else {
        console.log('📭 Booking not found (already deleted):', bookingId);
        return false;
      }
    } catch (error) {
      console.error('❌ Error cleaning up booking:', bookingId, error);
      return false;
    }
  }

  /**
   * Force cleanup of a specific booking (used by navigation guard)
   */
  async forceCleanupBooking(bookingId: string): Promise<boolean> {
    console.log('💨 Force cleaning up booking:', bookingId);
    const result = await this.deleteBookingIfAbandoned(bookingId);
    this.clearActiveBooking();
    return result;
  }

  /**
   * Check if there's currently an active booking being tracked
   */
  hasActiveBooking(): boolean {
    return this.getActiveBooking() !== null;
  }

  /**
   * Get time remaining before auto-cleanup
   */
  getTimeUntilCleanup(): number | null {
    const activeBooking = this.getActiveBooking();
    if (activeBooking) {
      return Math.max(0, activeBooking.autoCleanupAt.getTime() - Date.now());
    }
    return null;
  }

  /**
   * Extend the cleanup timeout (useful if user is actively browsing)
   */
  extendCleanupTimeout(additionalMinutes: number = 15) {
    const activeBooking = this.getActiveBooking();
    if (activeBooking) {
      activeBooking.autoCleanupAt = new Date(
        activeBooking.autoCleanupAt.getTime() + additionalMinutes * 60 * 1000
      );
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(activeBooking));
      console.log(
        `⏳ Extended cleanup timeout by ${additionalMinutes} minutes`
      );
    }
  }
}
