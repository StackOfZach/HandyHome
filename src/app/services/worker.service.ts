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

export interface ServicePrice {
  name: string;
  minPrice: number;
  maxPrice: number;
}

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
  servicePrices?: ServicePrice[]; // New field for service pricing
  workRadius?: number;
  availableDays?: string[];
  timeAvailability?: { [key: string]: { startTime: string; endTime: string } };
  idPhotoUrl?: string;
  profilePhotoUrl?: string;
  idPhotoData?: string; // Base64 image data for temporary storage
  profilePhotoData?: string; // Base64 image data for temporary storage
  certificates?: { [skillName: string]: string }; // Base64 certificate data for each skill
  certificateUrls?: { [skillName: string]: string }; // URLs for uploaded certificates
  status?: 'pending_verification' | 'verified' | 'rejected';
  rating?: number; // Worker's average rating
  jobsCompleted?: number; // Total completed jobs
  totalEarnings?: number; // Total earnings
  bio?: string; // New field for worker biography
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
   * Get complete worker information by combining workers and users collections
   */
  async getCompleteWorkerProfile(uid: string): Promise<WorkerProfile | null> {
    try {
      // Get worker data from workers collection
      const workerDoc = await getDoc(doc(this.firestore, 'workers', uid));
      // Get user data from users collection
      const userDoc = await getDoc(doc(this.firestore, 'users', uid));

      if (workerDoc.exists()) {
        const workerData = workerDoc.data() as DocumentData;
        const userData = userDoc.exists()
          ? (userDoc.data() as DocumentData)
          : {};

        // Combine both data sources, prioritizing workers collection for worker-specific fields
        return {
          uid,
          // User basic info from users collection
          fullName: userData['fullName'] || workerData['fullName'] || '',
          email: userData['email'] || workerData['email'] || '',
          phone:
            userData['phoneNumber'] ||
            userData['phone'] ||
            workerData['phone'] ||
            '',
          // Worker-specific data from workers collection
          fullAddress: workerData['fullAddress'] || userData['address'] || '',
          location: workerData['location'],
          skills: workerData['skills'] || [],
          workRadius: workerData['workRadius'],
          availableDays: workerData['availableDays'] || [],
          // Profile images - prioritize workers collection
          profilePhotoUrl: workerData['profilePhotoUrl'],
          profilePhotoData: workerData['profilePhotoData'], // Base64 data
          idPhotoUrl: workerData['idPhotoUrl'],
          idPhotoData: workerData['idPhotoData'],
          // Worker status and ratings
          status: workerData['status'] || 'pending_verification',
          rating: workerData['rating'] || 0,
          jobsCompleted: workerData['jobsCompleted'] || 0,
          totalEarnings: workerData['totalEarnings'] || 0,
          // Timestamps
          createdAt: workerData['createdAt']?.toDate() || new Date(),
          verifiedAt: workerData['verifiedAt']?.toDate(),
          interviewCompletedAt: workerData['interviewCompletedAt']?.toDate(),
          updatedAt: workerData['updatedAt']?.toDate(),
          // Additional fields
          currentStep: workerData['currentStep'],
          emergencyContact: workerData['emergencyContact'],
          emergencyPhone: workerData['emergencyPhone'],
        } as WorkerProfile;
      }
      return null;
    } catch (error) {
      console.error('Error getting complete worker profile:', error);
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
      // Check if interview is completed (step 5) or if interviewCompletedAt is set
      return (
        profile?.currentStep === 5 ||
        profile?.interviewCompletedAt != null ||
        false
      );
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
      // Check both status and verifiedAt field for verification
      return (
        (profile?.status === 'verified' && profile?.verifiedAt != null) || false
      );
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

      // Use the complete worker profile method for consistency
      const workersWithUserData = await Promise.all(
        querySnapshot.docs.map(async (workerDoc) => {
          const completeProfile = await this.getCompleteWorkerProfile(
            workerDoc.id
          );
          return completeProfile;
        })
      );

      // Filter out null values and return only valid worker profiles
      return workersWithUserData.filter(
        (worker): worker is WorkerProfile => worker !== null
      );
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
