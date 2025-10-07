import { Injectable } from '@angular/core';
import {
  Firestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  DocumentData,
} from '@angular/fire/firestore';

export interface WorkerProfile {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  fullAddress?: string;
  location?: {
    lat: number;
    lng: number;
  };
  skills?: string[];
  workRadius?: number;
  availableDays?: string[];
  idPhotoUrl?: string;
  profilePhotoUrl?: string;
  idPhotoData?: string; // Base64 image data for temporary storage
  profilePhotoData?: string; // Base64 image data for temporary storage
  status?: 'pending_verification' | 'verified' | 'rejected';
  rating?: number; // Worker's average rating
  jobsCompleted?: number; // Total completed jobs
  totalEarnings?: number; // Total earnings
  createdAt: Date;
  currentStep?: number;
  emergencyContact?: string;
  emergencyPhone?: string;
  interviewCompletedAt?: Date;
  verifiedAt?: Date;
  updatedAt?: Date;
}

@Injectable({
  providedIn: 'root',
})
export class WorkerService {
  constructor(private firestore: Firestore) {}

  /**
   * Get worker profile from Firestore
   */
  async getWorkerProfile(uid: string): Promise<WorkerProfile | null> {
    try {
      const workerDoc = await getDoc(doc(this.firestore, 'workers', uid));
      if (workerDoc.exists()) {
        const data = workerDoc.data() as DocumentData;
        return {
          ...data,
          createdAt: data['createdAt']?.toDate() || new Date(),
        } as WorkerProfile;
      }
      return null;
    } catch (error) {
      console.error('Error getting worker profile:', error);
      throw error;
    }
  }

  /**
   * Create or update worker profile
   */
  async updateWorkerProfile(
    uid: string,
    profileData: Partial<WorkerProfile>
  ): Promise<void> {
    try {
      console.log('Updating worker profile for UID:', uid);
      console.log('Profile data to save:', profileData);

      const workerDocRef = doc(this.firestore, 'workers', uid);
      const existingDoc = await getDoc(workerDocRef);

      if (existingDoc.exists()) {
        // Update existing profile
        const updateData = {
          ...profileData,
          updatedAt: new Date(),
        };
        console.log('Updating existing profile with data:', updateData);
        await updateDoc(workerDocRef, updateData);
        console.log('Successfully updated existing worker profile');
      } else {
        // Create new profile
        const newProfile: WorkerProfile = {
          uid,
          fullName: '',
          email: '',
          phone: '',
          status: 'pending_verification',
          currentStep: 1,
          createdAt: new Date(),
          ...profileData,
        };
        console.log('Creating new profile with data:', newProfile);
        await setDoc(workerDocRef, newProfile);
        console.log('Successfully created new worker profile');
      }
    } catch (error) {
      console.error('Error updating worker profile:', error);
      throw error;
    }
  }

  /**
   * Complete worker interview process
   */
  async completeInterview(uid: string): Promise<void> {
    try {
      const workerDocRef = doc(this.firestore, 'workers', uid);
      await updateDoc(workerDocRef, {
        currentStep: 4,
        status: 'pending_verification',
        interviewCompletedAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Error completing interview:', error);
      throw error;
    }
  }

  /**
   * Check if worker has completed interview
   */
  async hasCompletedInterview(uid: string): Promise<boolean> {
    try {
      const profile = await this.getWorkerProfile(uid);
      return profile?.currentStep === 4 || false;
    } catch (error) {
      console.error('Error checking interview completion:', error);
      return false;
    }
  }

  /**
   * Check if worker is verified
   */
  async isWorkerVerified(uid: string): Promise<boolean> {
    try {
      const profile = await this.getWorkerProfile(uid);
      return profile?.status === 'verified' || false;
    } catch (error) {
      console.error('Error checking worker verification:', error);
      return false;
    }
  }

  /**
   * Get all workers pending verification (for admin)
   */
  async getWorkersForVerification(): Promise<WorkerProfile[]> {
    try {
      const workersQuery = query(
        collection(this.firestore, 'workers'),
        where('status', '==', 'pending_verification')
      );
      const querySnapshot = await getDocs(workersQuery);

      // Fetch user data for each worker
      const workersWithUserData = await Promise.all(
        querySnapshot.docs.map(async (workerDoc) => {
          const workerData = workerDoc.data() as DocumentData;

          // Fetch user data from users collection
          const userDocRef = doc(this.firestore, 'users', workerDoc.id);
          const userDoc = await getDoc(userDocRef);
          const userData = userDoc.exists() ? userDoc.data() : {};

          return {
            ...workerData,
            fullName:
              userData['fullName'] || workerData['fullName'] || 'Unknown',
            email: userData['email'] || workerData['email'] || 'No email',
            createdAt: workerData['createdAt']?.toDate() || new Date(),
          } as WorkerProfile;
        })
      );

      return workersWithUserData;
    } catch (error) {
      console.error('Error getting workers for verification:', error);
      throw error;
    }
  }

  /**
   * Verify worker (admin function)
   */
  async verifyWorker(uid: string, approved: boolean): Promise<void> {
    try {
      const workerDocRef = doc(this.firestore, 'workers', uid);
      await updateDoc(workerDocRef, {
        status: approved ? 'verified' : 'rejected',
        verifiedAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Error verifying worker:', error);
      throw error;
    }
  }

  /**
   * Get verified workers (for admin)
   */
  async getVerifiedWorkers(): Promise<WorkerProfile[]> {
    try {
      const workersQuery = query(
        collection(this.firestore, 'workers'),
        where('status', '==', 'verified')
      );
      const querySnapshot = await getDocs(workersQuery);

      // Fetch user data for each worker
      const workersWithUserData = await Promise.all(
        querySnapshot.docs.map(async (workerDoc) => {
          const workerData = workerDoc.data() as DocumentData;

          // Fetch user data from users collection
          const userDocRef = doc(this.firestore, 'users', workerDoc.id);
          const userDoc = await getDoc(userDocRef);
          const userData = userDoc.exists() ? userDoc.data() : {};

          return {
            ...workerData,
            fullName:
              userData['fullName'] || workerData['fullName'] || 'Unknown',
            email: userData['email'] || workerData['email'] || 'No email',
            createdAt: workerData['createdAt']?.toDate() || new Date(),
            verifiedAt: workerData['verifiedAt']?.toDate(),
            updatedAt: workerData['updatedAt']?.toDate(),
          } as WorkerProfile;
        })
      );

      return workersWithUserData;
    } catch (error) {
      console.error('Error getting verified workers:', error);
      throw error;
    }
  }

  /**
   * Update worker status (admin function)
   */
  async updateWorkerStatus(
    uid: string,
    status: 'suspended' | 'banned' | 'verified'
  ): Promise<void> {
    try {
      const workerDocRef = doc(this.firestore, 'workers', uid);
      await updateDoc(workerDocRef, {
        status: status,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Error updating worker status:', error);
      throw error;
    }
  }
}
