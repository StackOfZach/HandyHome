import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  getDoc,
  query,
  where,
  getDocs,
  orderBy,
  serverTimestamp,
} from '@angular/fire/firestore';

export interface PaymentData {
  id?: string;
  bookingId: string;
  clientId: string;
  workerId: string;
  workerName: string;
  clientName: string;
  amount: number;
  breakdown: {
    serviceCharge: number;
    transportFee: number;
    basePrice: number;
    tax?: number;
    discount?: number;
  };
  paymentMethod: 'cash_on_service' | 'card' | 'digital_wallet';
  status: 'pending' | 'completed' | 'disputed' | 'refunded';
  paymentType: 'full' | 'partial' | 'tip';

  // COS specific fields
  confirmationCode?: string;
  verificationMethod?: 'photo' | 'signature' | 'otp';
  verificationData?: {
    photoUrl?: string;
    signatureData?: string;
    otpCode?: string;
    verifiedAt?: any;
  };

  // Payment timing
  initiatedAt: any;
  completedAt?: any;
  confirmedAt?: any;

  // Receipt info
  receiptNumber: string;
  receiptGenerated: boolean;
  receiptUrl?: string;

  // Notes and feedback
  notes?: string;
  clientFeedback?: string;
  workerNotes?: string;

  // Dispute handling
  disputeReason?: string;
  disputeStatus?: 'none' | 'pending' | 'resolved';
  disputeResolvedAt?: any;
}

export interface PaymentReceipt {
  id: string;
  receiptNumber: string;
  bookingId: string;
  paymentId: string;
  clientName: string;
  workerName: string;
  serviceName: string;
  serviceDate: Date;
  paymentDate: Date;
  amount: number;
  breakdown: PaymentData['breakdown'];
  paymentMethod: string;
  confirmationCode: string;
  receiptUrl?: string;
  generatedAt: any;
}

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  constructor(private firestore: Firestore) {}

  /**
   * Initialize payment for a booking
   */
  async initializePayment(
    paymentData: Omit<
      PaymentData,
      'id' | 'receiptNumber' | 'initiatedAt' | 'receiptGenerated'
    >
  ): Promise<string> {
    try {
      const paymentsCollection = collection(this.firestore, 'payments');

      const receiptNumber = this.generateReceiptNumber();

      const newPayment: Omit<PaymentData, 'id'> = {
        ...paymentData,
        receiptNumber,
        receiptGenerated: false,
        initiatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(paymentsCollection, newPayment);

      return docRef.id;
    } catch (error) {
      console.error('Error initializing payment:', error);
      throw error;
    }
  }

  /**
   * Complete Cash on Service payment
   */
  async completePayment(
    paymentId: string,
    verificationData: PaymentData['verificationData'],
    workerNotes?: string
  ): Promise<void> {
    try {
      const paymentRef = doc(this.firestore, 'payments', paymentId);
      const confirmationCode = this.generateConfirmationCode();

      const updateData: any = {
        status: 'completed',
        completedAt: serverTimestamp(),
        confirmationCode,
        verificationData,
        receiptGenerated: true,
      };

      if (workerNotes) {
        updateData.workerNotes = workerNotes;
      }

      await updateDoc(paymentRef, updateData);

      // Generate receipt
      await this.generateReceipt(paymentId);

      // Update booking status to reflect payment completion
      const payment = await this.getPaymentById(paymentId);
      if (payment) {
        await this.updateBookingPaymentStatus(payment.bookingId, 'completed');
      }
    } catch (error) {
      console.error('Error completing payment:', error);
      throw error;
    }
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(paymentId: string): Promise<PaymentData | null> {
    try {
      const paymentRef = doc(this.firestore, 'payments', paymentId);
      const paymentSnap = await getDoc(paymentRef);

      if (paymentSnap.exists()) {
        return {
          id: paymentSnap.id,
          ...paymentSnap.data(),
        } as PaymentData;
      }

      return null;
    } catch (error) {
      console.error('Error fetching payment:', error);
      throw error;
    }
  }

  /**
   * Get payments for a specific booking
   */
  async getBookingPayments(bookingId: string): Promise<PaymentData[]> {
    try {
      const paymentsCollection = collection(this.firestore, 'payments');
      const q = query(
        paymentsCollection,
        where('bookingId', '==', bookingId),
        orderBy('initiatedAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const payments: PaymentData[] = [];

      querySnapshot.forEach((doc) => {
        payments.push({
          id: doc.id,
          ...doc.data(),
        } as PaymentData);
      });

      return payments;
    } catch (error) {
      console.error('Error fetching booking payments:', error);
      throw error;
    }
  }

  /**
   * Get client's payment history
   */
  async getClientPayments(clientId: string): Promise<PaymentData[]> {
    try {
      const paymentsCollection = collection(this.firestore, 'payments');
      const q = query(
        paymentsCollection,
        where('clientId', '==', clientId),
        orderBy('initiatedAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const payments: PaymentData[] = [];

      querySnapshot.forEach((doc) => {
        payments.push({
          id: doc.id,
          ...doc.data(),
        } as PaymentData);
      });

      return payments;
    } catch (error) {
      console.error('Error fetching client payments:', error);
      throw error;
    }
  }

  /**
   * Confirm payment by client (optional step for COS)
   */
  async confirmPayment(
    paymentId: string,
    clientFeedback?: string
  ): Promise<void> {
    try {
      const paymentRef = doc(this.firestore, 'payments', paymentId);

      const updateData: any = {
        confirmedAt: serverTimestamp(),
      };

      if (clientFeedback) {
        updateData.clientFeedback = clientFeedback;
      }

      await updateDoc(paymentRef, updateData);
    } catch (error) {
      console.error('Error confirming payment:', error);
      throw error;
    }
  }

  /**
   * Dispute a payment
   */
  async disputePayment(
    paymentId: string,
    disputeReason: string
  ): Promise<void> {
    try {
      const paymentRef = doc(this.firestore, 'payments', paymentId);

      await updateDoc(paymentRef, {
        status: 'disputed',
        disputeReason,
        disputeStatus: 'pending',
      });
    } catch (error) {
      console.error('Error disputing payment:', error);
      throw error;
    }
  }

  /**
   * Generate payment receipt
   */
  private async generateReceipt(paymentId: string): Promise<void> {
    try {
      const payment = await this.getPaymentById(paymentId);
      if (!payment) return;

      const receiptsCollection = collection(this.firestore, 'paymentReceipts');

      const receiptData: Omit<PaymentReceipt, 'id'> = {
        receiptNumber: payment.receiptNumber,
        bookingId: payment.bookingId,
        paymentId: paymentId,
        clientName: payment.clientName,
        workerName: payment.workerName,
        serviceName: 'HandyHome Service', // This could be enhanced to get actual service name
        serviceDate: new Date(), // This should come from booking data
        paymentDate: new Date(),
        amount: payment.amount,
        breakdown: payment.breakdown,
        paymentMethod: payment.paymentMethod,
        confirmationCode: payment.confirmationCode || '',
        generatedAt: serverTimestamp(),
      };

      await addDoc(receiptsCollection, receiptData);

      // Update payment with receipt URL (if needed)
      const paymentRef = doc(this.firestore, 'payments', paymentId);
      await updateDoc(paymentRef, {
        receiptGenerated: true,
      });
    } catch (error) {
      console.error('Error generating receipt:', error);
      throw error;
    }
  }

  /**
   * Get receipt by payment ID
   */
  async getPaymentReceipt(paymentId: string): Promise<PaymentReceipt | null> {
    try {
      const receiptsCollection = collection(this.firestore, 'paymentReceipts');
      const q = query(receiptsCollection, where('paymentId', '==', paymentId));

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return {
          id: doc.id,
          ...doc.data(),
        } as PaymentReceipt;
      }

      return null;
    } catch (error) {
      console.error('Error fetching receipt:', error);
      throw error;
    }
  }

  /**
   * Calculate payment amount with fees and taxes
   */
  calculatePaymentAmount(
    basePrice: number,
    serviceCharge: number,
    transportFee: number = 0,
    tax: number = 0,
    discount: number = 0
  ): { breakdown: PaymentData['breakdown']; total: number } {
    const breakdown = {
      basePrice,
      serviceCharge,
      transportFee,
      tax,
      discount,
    };

    const subtotal = basePrice + serviceCharge + transportFee;
    const afterTax = subtotal + tax;
    const total = Math.max(0, afterTax - discount);

    return { breakdown, total };
  }

  /**
   * Generate unique receipt number
   */
  private generateReceiptNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `HH${timestamp}${random}`;
  }

  /**
   * Generate confirmation code
   */
  private generateConfirmationCode(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  /**
   * Update booking payment status
   */
  private async updateBookingPaymentStatus(
    bookingId: string,
    status: 'pending' | 'completed' | 'disputed'
  ): Promise<void> {
    try {
      // Check both possible booking collections
      const collections = ['bookings', 'quickbookings'];

      for (const collectionName of collections) {
        const bookingRef = doc(this.firestore, collectionName, bookingId);
        const bookingSnap = await getDoc(bookingRef);

        if (bookingSnap.exists()) {
          await updateDoc(bookingRef, {
            paymentStatus: status,
            updatedAt: serverTimestamp(),
          });
          break;
        }
      }
    } catch (error) {
      console.error('Error updating booking payment status:', error);
    }
  }

  /**
   * Validate payment prerequisites
   */
  async canProcessPayment(
    bookingId: string
  ): Promise<{ canPay: boolean; reason?: string }> {
    try {
      // Check if booking exists and is completed
      const collections = ['bookings', 'quickbookings'];
      let booking = null;

      for (const collectionName of collections) {
        const bookingRef = doc(this.firestore, collectionName, bookingId);
        const bookingSnap = await getDoc(bookingRef);

        if (bookingSnap.exists()) {
          booking = bookingSnap.data();
          break;
        }
      }

      if (!booking) {
        return { canPay: false, reason: 'Booking not found' };
      }

      if (booking['status'] !== 'completed') {
        return {
          canPay: false,
          reason: 'Service must be completed before payment',
        };
      }

      // Check if payment already exists
      const existingPayments = await this.getBookingPayments(bookingId);
      const completedPayment = existingPayments.find(
        (p) => p.status === 'completed'
      );

      if (completedPayment) {
        return {
          canPay: false,
          reason: 'Payment already completed for this booking',
        };
      }

      return { canPay: true };
    } catch (error) {
      console.error('Error validating payment prerequisites:', error);
      return {
        canPay: false,
        reason: 'Unable to validate payment eligibility',
      };
    }
  }
}
