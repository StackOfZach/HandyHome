import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  getDocs,
  orderBy,
  serverTimestamp,
} from '@angular/fire/firestore';

export interface WorkerReport {
  id?: string;
  reporterId: string; // Client who is reporting
  reporterName: string;
  reporterEmail: string;
  workerId: string;
  workerName: string;
  bookingId?: string; // Optional: related booking
  reportType:
    | 'poor_service'
    | 'unprofessional_behavior'
    | 'no_show'
    | 'overcharging'
    | 'safety_concern'
    | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  evidence?: {
    photos: string[]; // URLs or base64 images
    screenshots: string[];
  };
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
  adminNotes?: string;
  resolution?: string;
  createdAt: any;
  updatedAt?: any;
  reviewedAt?: any;
  reviewedBy?: string; // Admin ID
}

export interface ReportCategory {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  icon: string;
}

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  constructor(private firestore: Firestore) {}

  /**
   * Get available report categories
   */
  getReportCategories(): ReportCategory[] {
    return [
      {
        id: 'poor_service',
        name: 'Poor Service Quality',
        description: 'Work was not completed satisfactorily or below standards',
        severity: 'medium',
        icon: 'thumbs-down',
      },
      {
        id: 'unprofessional_behavior',
        name: 'Unprofessional Behavior',
        description: 'Worker was rude, inappropriate, or unprofessional',
        severity: 'high',
        icon: 'warning',
      },
      {
        id: 'no_show',
        name: 'No Show / Late Arrival',
        description: 'Worker did not show up or was significantly late',
        severity: 'high',
        icon: 'time',
      },
      {
        id: 'overcharging',
        name: 'Overcharging / Price Issues',
        description:
          'Worker charged more than agreed or demanded extra payment',
        severity: 'medium',
        icon: 'cash',
      },
      {
        id: 'safety_concern',
        name: 'Safety Concerns',
        description:
          'Worker violated safety protocols or created unsafe conditions',
        severity: 'critical',
        icon: 'shield',
      },
      {
        id: 'other',
        name: 'Other Issues',
        description: 'Other concerns not covered by the above categories',
        severity: 'low',
        icon: 'ellipsis-horizontal',
      },
    ];
  }

  /**
   * Submit a new worker report
   */
  async submitReport(
    reportData: Omit<WorkerReport, 'id' | 'createdAt' | 'status'>
  ): Promise<string> {
    try {
      const reportsCollection = collection(this.firestore, 'workerReports');

      const newReport: Omit<WorkerReport, 'id'> = {
        ...reportData,
        status: 'pending',
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(reportsCollection, newReport);

      // Update worker's report count (for admin tracking)
      await this.updateWorkerReportStats(reportData.workerId);

      return docRef.id;
    } catch (error) {
      console.error('Error submitting report:', error);
      throw error;
    }
  }

  /**
   * Get reports for a specific worker (admin use)
   */
  async getWorkerReports(workerId: string): Promise<WorkerReport[]> {
    try {
      const reportsCollection = collection(this.firestore, 'workerReports');
      const q = query(
        reportsCollection,
        where('workerId', '==', workerId),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const reports: WorkerReport[] = [];

      querySnapshot.forEach((doc) => {
        reports.push({
          id: doc.id,
          ...doc.data(),
        } as WorkerReport);
      });

      return reports;
    } catch (error) {
      console.error('Error fetching worker reports:', error);
      throw error;
    }
  }

  /**
   * Get reports submitted by a specific client
   */
  async getClientReports(clientId: string): Promise<WorkerReport[]> {
    try {
      const reportsCollection = collection(this.firestore, 'workerReports');
      const q = query(
        reportsCollection,
        where('reporterId', '==', clientId),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const reports: WorkerReport[] = [];

      querySnapshot.forEach((doc) => {
        reports.push({
          id: doc.id,
          ...doc.data(),
        } as WorkerReport);
      });

      return reports;
    } catch (error) {
      console.error('Error fetching client reports:', error);
      throw error;
    }
  }

  /**
   * Update report status (admin use)
   */
  async updateReportStatus(
    reportId: string,
    status: WorkerReport['status'],
    adminId: string,
    adminNotes?: string,
    resolution?: string
  ): Promise<void> {
    try {
      const reportRef = doc(this.firestore, 'workerReports', reportId);

      const updateData: any = {
        status,
        reviewedBy: adminId,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (adminNotes) {
        updateData.adminNotes = adminNotes;
      }

      if (resolution) {
        updateData.resolution = resolution;
      }

      await updateDoc(reportRef, updateData);
    } catch (error) {
      console.error('Error updating report status:', error);
      throw error;
    }
  }

  /**
   * Get all pending reports (admin use)
   */
  async getPendingReports(): Promise<WorkerReport[]> {
    try {
      const reportsCollection = collection(this.firestore, 'workerReports');
      const q = query(
        reportsCollection,
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const reports: WorkerReport[] = [];

      querySnapshot.forEach((doc) => {
        reports.push({
          id: doc.id,
          ...doc.data(),
        } as WorkerReport);
      });

      return reports;
    } catch (error) {
      console.error('Error fetching pending reports:', error);
      throw error;
    }
  }

  /**
   * Update worker report statistics
   */
  private async updateWorkerReportStats(workerId: string): Promise<void> {
    try {
      // Get current report count for this worker
      const reports = await this.getWorkerReports(workerId);
      const reportCount = reports.length;

      // Update worker profile with report statistics
      const workerRef = doc(this.firestore, 'workers', workerId);
      await updateDoc(workerRef, {
        reportCount: reportCount,
        lastReportedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // If critical reports exceed threshold, flag for review
      const criticalReports = reports.filter(
        (r) => r.severity === 'critical' && r.status !== 'dismissed'
      );
      if (criticalReports.length >= 3) {
        await updateDoc(workerRef, {
          flaggedForReview: true,
          flagReason: 'Multiple critical reports',
        });
      }
    } catch (error) {
      console.error('Error updating worker report stats:', error);
    }
  }

  /**
   * Check if client can report this worker (prevent spam)
   */
  async canReportWorker(
    clientId: string,
    workerId: string,
    bookingId?: string
  ): Promise<{ canReport: boolean; reason?: string }> {
    try {
      const reportsCollection = collection(this.firestore, 'workerReports');

      // Check if already reported this worker for this booking
      if (bookingId) {
        const existingBookingReportQuery = query(
          reportsCollection,
          where('reporterId', '==', clientId),
          where('workerId', '==', workerId),
          where('bookingId', '==', bookingId)
        );

        const bookingReportSnapshot = await getDocs(existingBookingReportQuery);
        if (!bookingReportSnapshot.empty) {
          return {
            canReport: false,
            reason: 'You have already reported this worker for this booking.',
          };
        }
      }

      // Check report frequency (max 3 reports per worker per month)
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const recentReportsQuery = query(
        reportsCollection,
        where('reporterId', '==', clientId),
        where('workerId', '==', workerId),
        where('createdAt', '>=', oneMonthAgo)
      );

      const recentReportsSnapshot = await getDocs(recentReportsQuery);
      if (recentReportsSnapshot.size >= 3) {
        return {
          canReport: false,
          reason:
            'You have reached the maximum number of reports for this worker this month.',
        };
      }

      return { canReport: true };
    } catch (error) {
      console.error('Error checking report eligibility:', error);
      return { canReport: true };
    }
  }
}
