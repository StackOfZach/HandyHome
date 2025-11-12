import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  Timestamp,
} from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class BookingMaintenanceService {
  constructor(private firestore: Firestore) {}

  /**
   * Cleanup expired bookings that are still in 'searching' status
   * This can be called periodically or from a Cloud Function
   */
  async cleanupExpiredBookings(): Promise<{
    deleted: number;
    errors: string[];
  }> {
    console.log('🧹 Starting cleanup of expired bookings...');

    const now = new Date();
    const errors: string[] = [];
    let deletedCount = 0;

    try {
      // Query for bookings that should be auto-cleaned
      const expiredBookingsQuery = query(
        collection(this.firestore, 'bookings'),
        where('status', '==', 'searching'),
        where('autoCleanupAt', '<=', now)
      );

      const snapshot = await getDocs(expiredBookingsQuery);

      console.log(`📋 Found ${snapshot.size} expired bookings to cleanup`);

      // Delete each expired booking
      for (const bookingDoc of snapshot.docs) {
        try {
          const data = bookingDoc.data();

          // Double-check that it's truly abandoned
          if (data['status'] === 'searching' && !data['assignedWorker']) {
            await deleteDoc(doc(this.firestore, 'bookings', bookingDoc.id));
            deletedCount++;
            console.log('🗑️ Deleted expired booking:', bookingDoc.id);
          } else {
            console.log('✋ Skipping booking (status changed):', bookingDoc.id);
          }
        } catch (error) {
          const errorMsg = `Failed to delete booking ${bookingDoc.id}: ${error}`;
          console.error('❌', errorMsg);
          errors.push(errorMsg);
        }
      }

      console.log(
        `✅ Cleanup completed: ${deletedCount} bookings deleted, ${errors.length} errors`
      );
      return { deleted: deletedCount, errors };
    } catch (error) {
      const errorMsg = `Failed to query expired bookings: ${error}`;
      console.error('❌', errorMsg);
      return { deleted: 0, errors: [errorMsg] };
    }
  }

  /**
   * Cleanup bookings older than a certain age, regardless of auto-cleanup time
   * Useful for general maintenance
   */
  async cleanupOldBookings(
    maxAgeHours: number = 24
  ): Promise<{ deleted: number; errors: string[] }> {
    console.log(
      `🧹 Starting cleanup of old bookings (older than ${maxAgeHours}h)...`
    );

    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    const errors: string[] = [];
    let deletedCount = 0;

    try {
      // Query for old bookings still in searching status
      const oldBookingsQuery = query(
        collection(this.firestore, 'bookings'),
        where('status', '==', 'searching'),
        where('createdAt', '<=', Timestamp.fromDate(cutoffTime))
      );

      const snapshot = await getDocs(oldBookingsQuery);

      console.log(`📋 Found ${snapshot.size} old bookings to cleanup`);

      // Delete each old booking
      for (const bookingDoc of snapshot.docs) {
        try {
          const data = bookingDoc.data();

          // Double-check that it's truly abandoned
          if (data['status'] === 'searching' && !data['assignedWorker']) {
            await deleteDoc(doc(this.firestore, 'bookings', bookingDoc.id));
            deletedCount++;
            console.log('🗑️ Deleted old booking:', bookingDoc.id);
          }
        } catch (error) {
          const errorMsg = `Failed to delete old booking ${bookingDoc.id}: ${error}`;
          console.error('❌', errorMsg);
          errors.push(errorMsg);
        }
      }

      console.log(
        `✅ Old booking cleanup completed: ${deletedCount} bookings deleted, ${errors.length} errors`
      );
      return { deleted: deletedCount, errors };
    } catch (error) {
      const errorMsg = `Failed to query old bookings: ${error}`;
      console.error('❌', errorMsg);
      return { deleted: 0, errors: [errorMsg] };
    }
  }

  /**
   * Get statistics about bookings that might need cleanup
   */
  async getCleanupStatistics(): Promise<{
    searchingBookings: number;
    expiredBookings: number;
    oldBookings: number;
  }> {
    try {
      const now = new Date();
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Count all searching bookings
      const searchingQuery = query(
        collection(this.firestore, 'bookings'),
        where('status', '==', 'searching')
      );
      const searchingSnapshot = await getDocs(searchingQuery);

      // Count expired bookings
      const expiredQuery = query(
        collection(this.firestore, 'bookings'),
        where('status', '==', 'searching'),
        where('autoCleanupAt', '<=', now)
      );
      const expiredSnapshot = await getDocs(expiredQuery);

      // Count old bookings
      const oldQuery = query(
        collection(this.firestore, 'bookings'),
        where('status', '==', 'searching'),
        where('createdAt', '<=', Timestamp.fromDate(oneDayAgo))
      );
      const oldSnapshot = await getDocs(oldQuery);

      return {
        searchingBookings: searchingSnapshot.size,
        expiredBookings: expiredSnapshot.size,
        oldBookings: oldSnapshot.size,
      };
    } catch (error) {
      console.error('Error getting cleanup statistics:', error);
      return {
        searchingBookings: 0,
        expiredBookings: 0,
        oldBookings: 0,
      };
    }
  }
}
