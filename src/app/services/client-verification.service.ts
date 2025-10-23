import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  getDoc,
} from '@angular/fire/firestore';
import { inject } from '@angular/core';

export interface ClientVerification {
  id?: string;
  userId: string;
  userEmail: string;
  userName: string;
  idType: string;
  idNumber: string;
  address: string;
  birthDate: string;
  idImageBase64: string;
  profileImageBase64: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ClientVerificationService {
  private firestore = inject(Firestore);

  constructor() {}

  async submitVerification(
    verificationData: Omit<
      ClientVerification,
      'id' | 'idImageBase64' | 'profileImageBase64'
    >,
    idImageFile: File,
    profileImageFile: File
  ): Promise<void> {
    try {
      // Convert images to base64
      const idImageBase64 = await this.fileToBase64(idImageFile);
      const profileImageBase64 = await this.fileToBase64(profileImageFile);

      // Save verification data to Firestore with base64 images
      const verificationDoc = {
        ...verificationData,
        idImageBase64,
        profileImageBase64,
      };

      await addDoc(
        collection(this.firestore, 'client-verifications'),
        verificationDoc
      );

      // Update user profile to mark as pending verification
      const userDocRef = doc(this.firestore, 'users', verificationData.userId);
      await updateDoc(userDocRef, {
        verificationStatus: 'pending',
        verificationSubmittedAt: new Date(),
      });
    } catch (error) {
      console.error('Error submitting verification:', error);
      throw error;
    }
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  }

  async getPendingVerifications(): Promise<ClientVerification[]> {
    try {
      const q = query(
        collection(this.firestore, 'client-verifications'),
        where('status', '==', 'pending'),
        orderBy('submittedAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          } as ClientVerification)
      );
    } catch (error) {
      console.error('Error getting pending verifications:', error);
      throw error;
    }
  }

  async getAllVerifications(): Promise<ClientVerification[]> {
    try {
      const q = query(
        collection(this.firestore, 'client-verifications'),
        orderBy('submittedAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          } as ClientVerification)
      );
    } catch (error) {
      console.error('Error getting all verifications:', error);
      throw error;
    }
  }

  async approveVerification(
    verificationId: string,
    reviewerId: string,
    notes?: string
  ): Promise<void> {
    try {
      const verificationRef = doc(
        this.firestore,
        'client-verifications',
        verificationId
      );

      // Update verification status
      await updateDoc(verificationRef, {
        status: 'approved',
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
        reviewNotes: notes || '',
      });

      // Get verification data to update user profile
      const verificationDoc = await getDoc(verificationRef);
      if (verificationDoc.exists()) {
        const verificationData = verificationDoc.data() as ClientVerification;

        // Update user profile to approved
        const userDocRef = doc(
          this.firestore,
          'users',
          verificationData.userId
        );
        await updateDoc(userDocRef, {
          verificationStatus: 'approved',
          verificationApprovedAt: new Date(),
        });
      }
    } catch (error) {
      console.error('Error approving verification:', error);
      throw error;
    }
  }

  async rejectVerification(
    verificationId: string,
    reviewerId: string,
    notes: string
  ): Promise<void> {
    try {
      const verificationRef = doc(
        this.firestore,
        'client-verifications',
        verificationId
      );

      // Update verification status
      await updateDoc(verificationRef, {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
        reviewNotes: notes,
      });

      // Get verification data to update user profile
      const verificationDoc = await getDoc(verificationRef);
      if (verificationDoc.exists()) {
        const verificationData = verificationDoc.data() as ClientVerification;

        // Update user profile to rejected
        const userDocRef = doc(
          this.firestore,
          'users',
          verificationData.userId
        );
        await updateDoc(userDocRef, {
          verificationStatus: 'rejected',
          verificationRejectedAt: new Date(),
        });
      }
    } catch (error) {
      console.error('Error rejecting verification:', error);
      throw error;
    }
  }

  async getVerificationByUserId(
    userId: string
  ): Promise<ClientVerification | null> {
    try {
      const q = query(
        collection(this.firestore, 'client-verifications'),
        where('userId', '==', userId)
      );

      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        return null;
      }

      const doc = querySnapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data(),
      } as ClientVerification;
    } catch (error) {
      console.error('Error getting verification by user ID:', error);
      throw error;
    }
  }
}
