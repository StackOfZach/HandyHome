import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
} from '@angular/fire/firestore';

export interface WorkerAvailabilitySlot {
  id?: string;
  workerId: string;
  date: string; // Format: 'YYYY-MM-DD'
  timeSlots: TimeSlot[];
  isAvailable: boolean; // Overall availability for the day
  createdAt: Date;
  updatedAt: Date;
}

export interface TimeSlot {
  startTime: string; // Format: 'HH:mm' (24-hour format)
  endTime: string;   // Format: 'HH:mm' (24-hour format)
  isBooked: boolean;
  bookingId?: string; // Reference to the booking that occupies this slot
  estimatedDuration?: number; // Duration in hours
}

export interface WorkerOnlineStatus {
  workerId: string;
  isOnline: boolean;
  isAvailableForQuickBookings: boolean;
  lastActiveAt: Date;
  updatedAt: Date;
}

export interface BookingConflictCheck {
  hasConflict: boolean;
  conflictingBookings: string[];
  availableSlots: TimeSlot[];
}

@Injectable({
  providedIn: 'root'
})
export class WorkerAvailabilityService {

  constructor(private firestore: Firestore) {}

  /**
   * Set worker's online/offline status
   */
  async setWorkerOnlineStatus(workerId: string, isOnline: boolean, isAvailableForQuickBookings: boolean = true): Promise<void> {
    try {
      const statusData: WorkerOnlineStatus = {
        workerId,
        isOnline,
        isAvailableForQuickBookings: isOnline ? isAvailableForQuickBookings : false,
        lastActiveAt: new Date(),
        updatedAt: new Date()
      };

      await setDoc(doc(this.firestore, 'workerOnlineStatus', workerId), statusData);
      console.log(`Worker ${workerId} online status updated: ${isOnline}`);
    } catch (error) {
      console.error('Error updating worker online status:', error);
      throw error;
    }
  }

  /**
   * Get worker's current online status
   */
  async getWorkerOnlineStatus(workerId: string): Promise<WorkerOnlineStatus | null> {
    try {
      const statusDoc = await getDoc(doc(this.firestore, 'workerOnlineStatus', workerId));
      if (statusDoc.exists()) {
        return statusDoc.data() as WorkerOnlineStatus;
      }
      return null;
    } catch (error) {
      console.error('Error getting worker online status:', error);
      return null;
    }
  }

  /**
   * Check if worker is available for a specific date and time
   */
  async isWorkerAvailable(workerId: string, date: string, startTime: string, duration: number = 1): Promise<BookingConflictCheck> {
    try {
      // Check online status first - but be lenient for workers without status records (backward compatibility)
      const onlineStatus = await this.getWorkerOnlineStatus(workerId);
      if (onlineStatus && !onlineStatus.isOnline) {
        // Only reject if worker explicitly set themselves offline
        return {
          hasConflict: true,
          conflictingBookings: [],
          availableSlots: []
        };
      }
      // If no status record exists, assume worker is available (backward compatibility)

      // Check existing bookings for the date
      const availabilityDoc = await getDoc(doc(this.firestore, 'workerAvailability', `${workerId}_${date}`));
      
      if (!availabilityDoc.exists()) {
        // No availability record exists, worker is available
        return {
          hasConflict: false,
          conflictingBookings: [],
          availableSlots: []
        };
      }

      const availabilityData = availabilityDoc.data() as WorkerAvailabilitySlot;
      
      if (!availabilityData.isAvailable) {
        return {
          hasConflict: true,
          conflictingBookings: [],
          availableSlots: []
        };
      }

      // Check for time conflicts
      const endTime = this.addHoursToTime(startTime, duration);
      const conflictingBookings: string[] = [];
      const availableSlots: TimeSlot[] = [];

      for (const slot of availabilityData.timeSlots) {
        if (this.timeSlotsOverlap(startTime, endTime, slot.startTime, slot.endTime)) {
          if (slot.isBooked && slot.bookingId) {
            conflictingBookings.push(slot.bookingId);
          }
        } else {
          if (!slot.isBooked) {
            availableSlots.push(slot);
          }
        }
      }

      return {
        hasConflict: conflictingBookings.length > 0,
        conflictingBookings,
        availableSlots
      };

    } catch (error) {
      console.error('Error checking worker availability:', error);
      return {
        hasConflict: true,
        conflictingBookings: [],
        availableSlots: []
      };
    }
  }

  /**
   * Book a time slot for a worker
   */
  async bookWorkerTimeSlot(workerId: string, date: string, startTime: string, duration: number, bookingId: string): Promise<boolean> {
    try {
      const docId = `${workerId}_${date}`;
      const endTime = this.addHoursToTime(startTime, duration);
      
      const availabilityDoc = await getDoc(doc(this.firestore, 'workerAvailability', docId));
      
      let availabilityData: WorkerAvailabilitySlot;
      
      if (availabilityDoc.exists()) {
        availabilityData = availabilityDoc.data() as WorkerAvailabilitySlot;
      } else {
        // Create new availability record
        availabilityData = {
          workerId,
          date,
          timeSlots: [],
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }

      // Add the booked time slot
      const newTimeSlot: TimeSlot = {
        startTime,
        endTime,
        isBooked: true,
        bookingId,
        estimatedDuration: duration
      };

      availabilityData.timeSlots.push(newTimeSlot);
      availabilityData.updatedAt = new Date();

      await setDoc(doc(this.firestore, 'workerAvailability', docId), availabilityData);
      console.log(`Booked time slot for worker ${workerId} on ${date} from ${startTime} to ${endTime}`);
      
      return true;
    } catch (error) {
      console.error('Error booking worker time slot:', error);
      return false;
    }
  }

  /**
   * Release a time slot when booking is cancelled
   */
  async releaseWorkerTimeSlot(workerId: string, date: string, bookingId: string): Promise<boolean> {
    try {
      const docId = `${workerId}_${date}`;
      const availabilityDoc = await getDoc(doc(this.firestore, 'workerAvailability', docId));
      
      if (!availabilityDoc.exists()) {
        return true; // Nothing to release
      }

      const availabilityData = availabilityDoc.data() as WorkerAvailabilitySlot;
      
      // Remove the time slot associated with this booking
      availabilityData.timeSlots = availabilityData.timeSlots.filter(slot => slot.bookingId !== bookingId);
      availabilityData.updatedAt = new Date();

      await setDoc(doc(this.firestore, 'workerAvailability', docId), availabilityData);
      console.log(`Released time slot for worker ${workerId} on ${date} for booking ${bookingId}`);
      
      return true;
    } catch (error) {
      console.error('Error releasing worker time slot:', error);
      return false;
    }
  }

  /**
   * Get all workers that are available for quick bookings
   */
  async getAvailableWorkersForQuickBookings(): Promise<string[]> {
    try {
      const statusQuery = query(
        collection(this.firestore, 'workerOnlineStatus'),
        where('isOnline', '==', true),
        where('isAvailableForQuickBookings', '==', true)
      );

      const statusSnapshot = await getDocs(statusQuery);
      return statusSnapshot.docs.map(doc => doc.data()['workerId']);
    } catch (error) {
      console.error('Error getting available workers for quick bookings:', error);
      return [];
    }
  }

  /**
   * Check if worker has booking conflicts for a specific date and time (ignores online status)
   * This is useful for scheduled bookings where we want to show all workers regardless of current online status
   */
  async hasBookingConflicts(workerId: string, date: string, startTime: string, duration: number = 1): Promise<BookingConflictCheck> {
    try {
      // Check existing bookings for the date (skip online status check)
      const availabilityDoc = await getDoc(doc(this.firestore, 'workerAvailability', `${workerId}_${date}`));
      
      if (!availabilityDoc.exists()) {
        // No availability record exists, worker has no conflicts
        return {
          hasConflict: false,
          conflictingBookings: [],
          availableSlots: []
        };
      }

      const availabilityData = availabilityDoc.data() as WorkerAvailabilitySlot;
      
      if (!availabilityData.isAvailable) {
        return {
          hasConflict: true,
          conflictingBookings: [],
          availableSlots: []
        };
      }

      // Check for time conflicts
      const endTime = this.addHoursToTime(startTime, duration);
      const conflictingBookings: string[] = [];
      const availableSlots: TimeSlot[] = [];

      for (const slot of availabilityData.timeSlots) {
        if (this.timeSlotsOverlap(startTime, endTime, slot.startTime, slot.endTime)) {
          if (slot.isBooked && slot.bookingId) {
            conflictingBookings.push(slot.bookingId);
          }
        } else {
          if (!slot.isBooked) {
            availableSlots.push(slot);
          }
        }
      }

      return {
        hasConflict: conflictingBookings.length > 0,
        conflictingBookings,
        availableSlots
      };

    } catch (error) {
      console.error('Error checking worker booking conflicts:', error);
      return {
        hasConflict: false, // Be lenient on errors for backward compatibility
        conflictingBookings: [],
        availableSlots: []
      };
    }
  }

  /**
   * Get workers available for a specific date and time (for scheduled bookings)
   */
  async getAvailableWorkersForScheduledBooking(date: string, startTime: string, duration: number = 1): Promise<string[]> {
    try {
      // Get all online workers
      const onlineWorkers = await this.getAvailableWorkersForQuickBookings();
      const availableWorkers: string[] = [];

      // Check each worker's availability for the specific time
      for (const workerId of onlineWorkers) {
        const availabilityCheck = await this.isWorkerAvailable(workerId, date, startTime, duration);
        if (!availabilityCheck.hasConflict) {
          availableWorkers.push(workerId);
        }
      }

      return availableWorkers;
    } catch (error) {
      console.error('Error getting available workers for scheduled booking:', error);
      return [];
    }
  }

  /**
   * Utility function to check if two time ranges overlap
   */
  private timeSlotsOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const start1Minutes = this.timeToMinutes(start1);
    const end1Minutes = this.timeToMinutes(end1);
    const start2Minutes = this.timeToMinutes(start2);
    const end2Minutes = this.timeToMinutes(end2);

    return start1Minutes < end2Minutes && end1Minutes > start2Minutes;
  }

  /**
   * Convert time string to minutes since midnight
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Add hours to a time string
   */
  private addHoursToTime(time: string, hours: number): string {
    const [h, m] = time.split(':').map(Number);
    const totalMinutes = h * 60 + m + (hours * 60);
    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMinutes = totalMinutes % 60;
    return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
  }

  /**
   * Format date to YYYY-MM-DD string
   */
  formatDateToString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Parse schedule date from various formats
   */
  parseScheduleDate(scheduleDate: any): string | null {
    if (!scheduleDate) return null;
    
    if (scheduleDate.toDate && typeof scheduleDate.toDate === 'function') {
      // Firestore Timestamp
      return this.formatDateToString(scheduleDate.toDate());
    } else if (scheduleDate instanceof Date) {
      return this.formatDateToString(scheduleDate);
    } else if (typeof scheduleDate === 'string') {
      // Try to parse string date
      const date = new Date(scheduleDate);
      if (!isNaN(date.getTime())) {
        return this.formatDateToString(date);
      }
    }
    
    return null;
  }
}