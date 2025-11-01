import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import {
  ToastController,
  LoadingController,
  AlertController,
} from '@ionic/angular';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { BookingService, BookingData } from '../../../services/booking.service';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  getDocs,
  doc,
  getDoc,
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

interface BookingHistoryData {
  id?: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  assignedWorker: string;
  workerId?: string;
  
  // Service details
  neededService: string;
  specificService?: string;
  categoryName?: string;
  category?: string;
  subService?: string;
  
  // Location details
  address: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  locationType?: string;
  
  // Scheduling
  scheduleDate?: string;
  scheduleTime?: string;
  scheduleDateTime?: Date;
  
  // Pricing
  priceRange?: number;
  maxBudget?: number;
  minBudget?: number;
  price?: number;
  basePrice?: number;
  serviceCharge?: number;
  transportFee?: number;
  total?: number;
  workerEarning?: number;
  
  // Final pricing (for completed jobs)
  finalPricing?: {
    basePrice: number;
    serviceCharge: number;
    transportFee: number;
    total: number;
    duration?: number;
  };
  
  // Job timer details
  jobTimer?: {
    startTime?: Date;
    endTime?: Date;
    duration?: number;
  };
  
  // Status and timestamps
  status: string;
  createdAt: Date;
  updatedAt?: Date;
  acceptedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  
  // Additional details
  description?: string;
  notes?: string;
  specialInstructions?: string;
  urgency?: string;
  priority?: string;
  
  // Rating and review
  rating?: number;
  review?: string;
  clientRating?: number;
  clientReview?: string;
  
  // Cancellation details
  cancellationReason?: string;
  rejectionReason?: string;
  
  // Payment details
  paymentStatus?: string;
  paymentMethod?: string;
  
  // Additional metadata
  estimatedDuration?: number | string;
  actualDuration?: number | string;
  images?: string[];
  title?: string;
  priceType?: string;
  locations?: any[];
  schedule?: any;
  platformFee?: number;
  totalAmount?: number;
}

@Component({
  selector: 'app-booking-history',
  templateUrl: './booking-history.page.html',
  styleUrls: ['./booking-history.page.scss'],
  standalone: false,
})
export class BookingHistoryPage implements OnInit, OnDestroy {
  userProfile: UserProfile | null = null;
  allBookings: BookingHistoryData[] = [];
  filteredBookings: BookingHistoryData[] = [];
  isLoading = true;
  error: string | null = null;

  // Filter options
  selectedStatus: string = 'all';
  searchTerm: string = '';
  showFilters: boolean = true;

  statusOptions = [
    { label: 'All Status', value: 'all' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
    { label: 'Accepted', value: 'accepted' },
    { label: 'In Progress', value: 'in-progress' },
    { label: 'Pending', value: 'pending' },
  ];

  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private authService: AuthService,
    private bookingService: BookingService,
    private firestore: Firestore,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.authService.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile?.uid) {
        this.loadBookingHistory();
      }
    });
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  async loadBookingHistory() {
    if (!this.userProfile?.uid) return;

    try {
      this.isLoading = true;
      this.error = null;

      // Set up real-time listener for bookings collection
      this.setupBookingsListener();
    } catch (error) {
      console.error('Error loading booking history:', error);
      this.error = 'Failed to load booking history';
      this.isLoading = false;
      this.showToast('Failed to load booking history', 'danger');
    }
  }

  private setupBookingsListener() {
    if (!this.userProfile?.uid) return;

    // Set up listener for only regular bookings collection
    this.setupRegularBookingsListener();
  }

  private setupRegularBookingsListener() {
    if (!this.userProfile?.uid) return;

    const bookingsRef = collection(this.firestore, 'bookings');
    const q = query(
      bookingsRef,
      where('assignedWorker', '==', this.userProfile.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`Found ${snapshot.docs.length} bookings`);
      this.processBookings(snapshot);
    });

    this.subscriptions.push({ unsubscribe } as any);
  }

  private processBookings(snapshot: any) {
    const bookings: BookingHistoryData[] = [];

    snapshot.docs.forEach((docSnap: any) => {
      const data = docSnap.data();
      console.log('Processing booking:', docSnap.id, data);

      // Convert Firestore Timestamp to Date
      const createdAt = data['createdAt']?.toDate() || new Date();
      const completedAt = data['completedAt']?.toDate() || null;
      const cancelledAt = data['cancelledAt']?.toDate() || null;
      const updatedAt = data['updatedAt']?.toDate() || null;
      const acceptedAt = data['acceptedAt']?.toDate() || null;
      const startedAt = data['startedAt']?.toDate() || null;

      // Extract pricing information from multiple possible sources
      const pricing = data['pricing'] || {};
      const finalPricing = data['finalPricing'] || {};
      
      const basePrice = finalPricing.basePrice || pricing.basePrice || data['price'] || data['basePrice'] || 0;
      const serviceCharge = finalPricing.serviceCharge || pricing.serviceCharge || data['serviceCharge'] || 0;
      const transportFee = finalPricing.transportFee || pricing.transportFee || data['transportFee'] || 50;
      const total = finalPricing.total || pricing.total || data['total'] || (basePrice + serviceCharge + transportFee);

      const booking: BookingHistoryData = {
        id: docSnap.id,
        clientId: data['clientId'] || '',
        clientName: data['clientName'] || data['clientDetails']?.name || 'Loading...',
        clientPhone: data['clientPhone'] || data['clientDetails']?.phone || '',
        clientEmail: data['clientEmail'] || data['clientDetails']?.email || '',
        assignedWorker: data['assignedWorker'] || data['workerId'] || '',
        workerId: data['workerId'] || data['assignedWorker'] || '',
        
        // Service details - using Firebase field names
        neededService: data['neededService'] || data['categoryName'] || data['category'] || '',
        specificService: data['specificService'] || data['subService'] || '',
        categoryName: data['categoryName'] || data['category'] || data['neededService'] || '',
        category: data['category'] || data['categoryName'] || data['neededService'] || '',
        subService: data['subService'] || data['specificService'] || '',
        
        // Location details - using Firebase field names
        address: data['address'] || '',
        coordinates: data['coordinates'] || null,
        locationType: data['locationType'] || '',
        
        // Scheduling - using Firebase field names with Timestamp handling
        scheduleDate: (data['scheduleDate']?.toDate ? data['scheduleDate'].toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : data['scheduleDate']) || data['schedule']?.date || '',
        scheduleTime: (data['scheduleTime']?.toDate ? data['scheduleTime'].toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : data['scheduleTime']) || data['schedule']?.time || '',
        scheduleDateTime: data['scheduleDateTime']?.toDate() || data['scheduleDate']?.toDate() || null,
        
        // Pricing - using Firebase field names
        priceRange: data['priceRange'] || 0,
        maxBudget: data['maxBudget'] || 0,
        minBudget: data['minBudget'] || 0,
        price: basePrice,
        basePrice: basePrice,
        serviceCharge: serviceCharge,
        transportFee: transportFee,
        total: total,
        workerEarning: finalPricing.workerEarnings || (basePrice + transportFee - serviceCharge) || 0,
        
        // Final pricing for completed jobs
        finalPricing: finalPricing.basePrice ? {
          basePrice: finalPricing.basePrice,
          serviceCharge: finalPricing.serviceCharge || 0,
          transportFee: finalPricing.transportFee || 0,
          total: finalPricing.total || 0,
          duration: finalPricing.duration || 0
        } : undefined,
        
        // Job timer details
        jobTimer: data['jobTimer'] ? {
          startTime: data['jobTimer'].startTime?.toDate() || null,
          endTime: data['jobTimer'].endTime?.toDate() || null,
          duration: data['jobTimer'].duration || 0
        } : undefined,
        
        // Status and timestamps
        status: data['status'] || 'pending',
        createdAt,
        updatedAt,
        acceptedAt: acceptedAt,
        startedAt: startedAt,
        completedAt,
        cancelledAt,
        
        // Additional details
        description: data['description'] || data['serviceDescription'] || '',
        notes: data['notes'] || data['specialInstructions'] || '',
        specialInstructions: data['specialInstructions'] || data['notes'] || '',
        urgency: data['urgency'] || data['priority'] || 'normal',
        priority: data['priority'] || data['urgency'] || 'normal',
        
        // Rating and review
        rating: data['rating'] || data['clientRating'] || data['workerRating'] || 0,
        review: data['review'] || data['clientReview'] || data['feedback'] || '',
        clientRating: data['clientRating'] || data['rating'] || 0,
        clientReview: data['clientReview'] || data['review'] || data['feedback'] || '',
        
        // Cancellation details
        cancellationReason: data['cancellationReason'] || data['rejectionReason'] || '',
        rejectionReason: data['rejectionReason'] || data['cancellationReason'] || '',
        
        // Payment details
        paymentStatus: data['paymentStatus'] || data['paymentDetails']?.status || 'pending',
        paymentMethod: data['paymentMethod'] || data['paymentDetails']?.method || '',
        
        // Legacy fields for compatibility
        locations: data['locations'] || [],
        schedule: data['schedule'] || data['scheduleDetails'] || {},
        priceType: data['priceType'] || 'fixed-price',
        title: data['title'] || `${data['neededService'] || data['categoryName']} Service`,
        images: data['images'] || [],
        estimatedDuration: data['estimatedDuration'] || data['duration'] || '',
        actualDuration: data['actualDuration'] || '',
        platformFee: serviceCharge,
        totalAmount: total,
      };

      bookings.push(booking);
    });

    // Replace all bookings (no merging needed since we're getting all at once)
    this.allBookings = bookings.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    this.applyFilters();
    this.isLoading = false;

    // Load client details for bookings that don't have them
    this.loadMissingClientDetails();

    console.log(`Total bookings loaded: ${this.allBookings.length}`);
  }

  private async loadMissingClientDetails() {
    const bookingsNeedingClientData = this.allBookings.filter(
      booking => booking.clientName === 'Loading...' && booking.clientId
    );

    for (const booking of bookingsNeedingClientData) {
      try {
        const usersRef = collection(this.firestore, 'users');
        const clientQuery = query(usersRef, where('uid', '==', booking.clientId));
        const clientSnapshot = await getDocs(clientQuery);
        
        if (!clientSnapshot.empty) {
          const clientData = clientSnapshot.docs[0].data();
          booking.clientName = clientData['fullName'] || clientData['displayName'] || clientData['name'] || 'Unknown Client';
          booking.clientPhone = clientData['phoneNumber'] || clientData['phone'] || '';
          booking.clientEmail = clientData['email'] || '';
        } else {
          booking.clientName = 'Unknown Client';
        }
      } catch (error) {
        console.error('Error loading client details:', error);
        booking.clientName = 'Unknown Client';
      }
    }

    // Re-apply filters to update the display
    this.applyFilters();
  }

  applyFilters() {
    let filtered = [...this.allBookings];

    // Filter by status
    if (this.selectedStatus !== 'all') {
      filtered = filtered.filter(booking => booking.status === this.selectedStatus);
    }

    // Filter by search term
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(booking =>
        booking.category?.toLowerCase().includes(term) ||
        booking.neededService?.toLowerCase().includes(term) ||
        booking.subService?.toLowerCase().includes(term) ||
        booking.clientName?.toLowerCase().includes(term) ||
        booking.description?.toLowerCase().includes(term) ||
        booking.address?.toLowerCase().includes(term)
      );
    }

    this.filteredBookings = filtered;
  }

  onStatusChange() {
    this.applyFilters();
  }

  onSearchChange() {
    this.applyFilters();
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
  }

  setQuickFilter(status: string) {
    this.selectedStatus = status;
    this.applyFilters();
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'payment-confirmed':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'accepted':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  getPaymentStatusBadgeClass(paymentStatus: string): string {
    switch (paymentStatus) {
      case 'paid':
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  formatDate(date: Date | null): string {
    if (!date) return 'N/A';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatCurrency(amount: number): string {
    return `₱${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  viewBookingDetails(booking: BookingHistoryData) {
    if (!booking.id) {
      this.showToast('Booking ID not available', 'danger');
      return;
    }

    console.log('Viewing booking details:', booking.id);
    // Navigate to the correct booking details page with ID as route parameter
    this.router.navigate(['/pages/worker/booking-details', booking.id]);
  }

  async refreshBookings() {
    await this.loadBookingHistory();
    this.showToast('Booking history refreshed', 'success');
  }

  goBack() {
    this.router.navigate(['/pages/worker/dashboard']);
  }

  trackByBookingId(index: number, booking: BookingHistoryData): string {
    return booking.id || index.toString();
  }

  getServiceIcon(serviceName?: string): string {
    if (!serviceName) return 'construct';
    
    const service = serviceName.toLowerCase();
    if (service.includes('plumb')) return 'water';
    if (service.includes('electric')) return 'flash';
    if (service.includes('clean')) return 'sparkles';
    if (service.includes('repair') || service.includes('fix')) return 'build';
    if (service.includes('paint')) return 'color-palette';
    if (service.includes('garden') || service.includes('lawn')) return 'leaf';
    if (service.includes('cook') || service.includes('chef')) return 'restaurant';
    if (service.includes('delivery')) return 'car';
    if (service.includes('massage') || service.includes('therapy')) return 'hand-left';
    if (service.includes('tutor') || service.includes('teach')) return 'school';
    return 'construct';
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return 'checkmark-circle';
      case 'cancelled': return 'close-circle';
      case 'in-progress': return 'time';
      case 'accepted': return 'thumbs-up';
      case 'payment-confirmed': return 'card';
      default: return 'ellipse';
    }
  }

  // Helper methods for template (matching quick booking history)
  getCategoryColor(categoryName: string): string {
    const colorMap: { [key: string]: string } = {
      'Appliances': 'bg-blue-100 text-blue-700',
      'Cleaning': 'bg-green-100 text-green-700', 
      'Electrical': 'bg-yellow-100 text-yellow-700',
      'Plumbing': 'bg-indigo-100 text-indigo-700',
      'Carpentry': 'bg-orange-100 text-orange-700',
      'Painting': 'bg-pink-100 text-pink-700',
      'Gardening': 'bg-emerald-100 text-emerald-700',
      'Technology': 'bg-purple-100 text-purple-700',
      'Automotive': 'bg-red-100 text-red-700',
    };
    return colorMap[categoryName] || 'bg-gray-100 text-gray-700';
  }

  getCategoryIcon(categoryName: string): string {
    const iconMap: { [key: string]: string } = {
      'Appliances': 'hardware-chip-outline',
      'Cleaning': 'sparkles-outline',
      'Electrical': 'flash-outline',
      'Plumbing': 'water-outline',
      'Carpentry': 'hammer-outline',
      'Painting': 'brush-outline',
      'Gardening': 'leaf-outline',
      'Technology': 'laptop-outline',
      'Automotive': 'car-outline',
    };
    return iconMap[categoryName] || 'construct-outline';
  }

  getStatusColor(status: string): string {
    const colorMap: { [key: string]: string } = {
      'completed': 'bg-green-100 text-green-800',
      'cancelled': 'bg-red-100 text-red-800',
      'accepted': 'bg-blue-100 text-blue-800',
      'in-progress': 'bg-yellow-100 text-yellow-800',
      'pending': 'bg-gray-100 text-gray-800',
      'searching': 'bg-orange-100 text-orange-800',
      'payment-confirmed': 'bg-emerald-100 text-emerald-800',
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800';
  }

  getCompletedCount(): number {
    return this.filteredBookings.filter(b => b.status === 'completed').length;
  }

  getAverageRating(): number {
    const ratingsWithValues = this.filteredBookings.filter(b => b.rating && b.rating > 0);
    if (ratingsWithValues.length === 0) return 0;
    
    const totalRating = ratingsWithValues.reduce((sum, b) => sum + (b.rating || 0), 0);
    return totalRating / ratingsWithValues.length;
  }

  getTotalEarnings(): number {
    return this.filteredBookings
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => {
        const earnings = b.workerEarning || b.total || 0;
        return sum + earnings;
      }, 0);
  }

  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'medium'
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
