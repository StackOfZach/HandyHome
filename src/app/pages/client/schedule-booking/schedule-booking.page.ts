import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { WorkerService, WorkerProfile } from '../../../services/worker.service';
import {
  AuthService,
  UserProfile,
  UserLocation,
} from '../../../services/auth.service';
import {
  DashboardService,
  ServiceCategory,
} from '../../../services/dashboard.service';
import {
  BookingService as FirebaseBookingService,
  NewBookingData,
} from '../../../services/booking.service';
import {
  LoadingController,
  ToastController,
  AlertController,
  ModalController,
} from '@ionic/angular';
// Using native JavaScript Date methods instead of date-fns

interface TimeSlot {
  time: string;
  available: boolean;
  booked?: boolean;
  price?: number;
}

interface BookingService {
  id: string;
  name: string;
  category: string;
  price: number;
  duration: number; // in minutes
  description?: string;
}

interface AvailabilitySlot {
  date: Date;
  timeSlots: TimeSlot[];
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isAvailable: boolean;
  isSelected: boolean;
  hasBookings?: boolean;
}

interface WorkerAvailability {
  availableDays: string[]; // ['monday', 'tuesday', 'wednesday', etc.]
  unavailableDates: string[]; // Specific dates worker is not available (YYYY-MM-DD format)
  workingHours: {
    start: string; // '08:00'
    end: string; // '18:00'
  };
  bookedSlots: {
    date: string; // YYYY-MM-DD
    times: string[]; // ['09:00', '10:00', etc.]
  }[];
}

@Component({
  selector: 'app-schedule-booking',
  templateUrl: './schedule-booking.page.html',
  styleUrls: ['./schedule-booking.page.scss'],
  standalone: false,
})
export class ScheduleBookingPage implements OnInit {
  worker: WorkerProfile | null = null;
  workerId: string = '';
  workerName: string = '';
  currentUser: UserProfile | null = null;

  // Calendar data
  currentDate: Date = new Date();
  currentMonth: Date = new Date();
  selectedDate: Date | null = null;
  calendarDays: CalendarDay[] = [];
  workerAvailability: WorkerAvailability | null = null;

  // Services data
  serviceCategories: ServiceCategory[] = [];
  availableServices: BookingService[] = [];
  selectedService: BookingService | null = null;

  // Time slots
  selectedTimeSlot: TimeSlot | null = null;
  timeSlots: TimeSlot[] = [];

  // UI State
  showWorkerDetails: boolean = false;
  isSubmitting: boolean = false;

  // Booking form data
  bookingForm = {
    selectedAddressId: '',
    customAddress: '',
    agreeToTerms: false,
    notes: '',
    contactNumber: '',
  };

  // Address data
  savedAddresses: UserLocation[] = [];
  showAddressOptions = false;
  useCustomAddress = false;

  // UI states
  isLoading = false;
  isLoadingAvailability = false;
  currentStep = 1; // 1: Service, 2: Date/Time, 3: Details, 4: Confirmation
  totalSteps = 4;
  workerImageLoadError = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private workerService: WorkerService,
    private authService: AuthService,
    private dashboardService: DashboardService,
    private firebaseBookingService: FirebaseBookingService,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private alertController: AlertController,
    private modalController: ModalController
  ) {}

  async ngOnInit() {
    // Get parameters from route
    this.workerId = this.route.snapshot.queryParamMap.get('workerId') || '';
    this.workerName = this.route.snapshot.queryParamMap.get('workerName') || '';

    if (!this.workerId) {
      this.showToast('Worker information not found', 'danger');
      this.router.navigate(['/client/browse-workers']);
      return;
    }

    await this.initializeBooking();
  }

  private async initializeBooking() {
    const loading = await this.loadingController.create({
      message: 'Loading booking information...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      // Load current user
      await this.getCurrentUser();

      // Load worker details
      await this.loadWorkerDetails();

      // Load service categories and worker services
      await this.loadServices();

      // Initialize calendar with current week
      this.initializeCalendar();
    } catch (error) {
      console.error('Error initializing booking:', error);
      this.showToast('Failed to load booking information', 'danger');
    } finally {
      this.isLoading = false;
      await loading.dismiss();
    }
  }

  private async getCurrentUser() {
    const user = await this.authService.getCurrentUser();
    this.currentUser = user
      ? {
          uid: user.uid,
          email: user.email || '',
          fullName: user.displayName || '',
          phone: '',
          role: 'client',
          createdAt: new Date(),
        }
      : null;

    // Load user's saved addresses
    if (this.currentUser) {
      await this.loadSavedAddresses();
    }
  }

  private async loadSavedAddresses() {
    try {
      if (!this.currentUser) return;

      // Get user profile with saved locations
      const userProfile = await this.authService.getUserProfile(
        this.currentUser.uid
      );
      if (userProfile && userProfile.savedLocations) {
        this.savedAddresses = userProfile.savedLocations;

        // Auto-select default address if available
        const defaultAddress = this.savedAddresses.find(
          (addr) => addr.isDefault
        );
        if (defaultAddress) {
          this.bookingForm.selectedAddressId = defaultAddress.id;
        }
      }
    } catch (error) {
      console.error('Error loading saved addresses:', error);
    }
  }

  private async loadWorkerDetails() {
    this.worker = await this.workerService.getCompleteWorkerProfile(
      this.workerId
    );
    if (this.worker) {
      this.workerName = this.worker.fullName;
      // Reset image error flag when loading new worker data
      this.workerImageLoadError = false;
      await this.loadWorkerAvailability();
    }
  }

  private async loadWorkerAvailability() {
    if (!this.worker) return;

    // Load worker's availability data
    this.workerAvailability = {
      availableDays: this.worker.availableDays || [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
      ],
      unavailableDates: [], // TODO: Load from database
      workingHours: {
        start: '08:00',
        end: '18:00',
      },
      bookedSlots: [], // TODO: Load existing bookings from database
    };

    // Generate calendar days with availability
    this.generateCalendarDays();
  }

  private generateCalendarDays() {
    if (!this.workerAvailability) return;

    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get first day of the month and calculate start of calendar (including previous month days)
    const firstDayOfMonth = new Date(year, month, 1);
    const startDay = firstDayOfMonth.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const startDate = new Date(firstDayOfMonth);
    startDate.setDate(startDate.getDate() - startDay);

    // Generate 42 days (6 weeks) for the calendar grid
    this.calendarDays = [];
    for (let i = 0; i < 42; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);

      const dayOfWeek = currentDate.getDay();
      const dayName = this.getDayName(dayOfWeek);

      const calendarDay: CalendarDay = {
        date: new Date(currentDate),
        isCurrentMonth: currentDate.getMonth() === month,
        isToday: this.isSameDay(currentDate, today),
        isPast: currentDate < today,
        isAvailable: this.isWorkerAvailable(currentDate, dayName),
        isSelected: this.selectedDate
          ? this.isSameDay(currentDate, this.selectedDate)
          : false,
        hasBookings: this.hasExistingBookings(currentDate),
      };

      this.calendarDays.push(calendarDay);
    }
  }

  private getDayName(dayOfWeek: number): string {
    const days = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    return days[dayOfWeek];
  }

  private isWorkerAvailable(date: Date, dayName: string): boolean {
    if (!this.workerAvailability) return false;

    // Check if the day of week is in worker's available days
    const isDayAvailable =
      this.workerAvailability.availableDays.includes(dayName);

    // Check if the specific date is in unavailable dates
    const dateString = this.formatDateToString(date);
    const isSpecificDateUnavailable =
      this.workerAvailability.unavailableDates.includes(dateString);

    return isDayAvailable && !isSpecificDateUnavailable;
  }

  private hasExistingBookings(date: Date): boolean {
    if (!this.workerAvailability) return false;

    const dateString = this.formatDateToString(date);
    return this.workerAvailability.bookedSlots.some(
      (slot) => slot.date === dateString
    );
  }

  private formatDateToString(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async loadServices() {
    try {
      // Load service categories
      this.serviceCategories =
        await this.dashboardService.getServiceCategories();

      // Filter services that the worker can provide
      this.availableServices = [];

      this.serviceCategories.forEach((category) => {
        category.services.forEach((serviceName) => {
          // Check if worker has this skill
          if (this.worker?.skills?.includes(serviceName)) {
            this.availableServices.push({
              id: `${category.id}-${serviceName}`,
              name: serviceName,
              category: category.name,
              price: category.averagePrice || 100, // Default price
              duration: category.estimatedDuration || 60, // Default duration in minutes
              description: `Professional ${serviceName.toLowerCase()} service`,
            });
          }
        });
      });
    } catch (error) {
      console.error('Error loading services:', error);
      this.showToast('Failed to load services', 'warning');
    }
  }

  private initializeCalendar() {
    this.currentMonth = new Date();
    this.generateCalendarDays();
  }

  // Calendar navigation
  goToPreviousMonth() {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() - 1,
      1
    );
    this.generateCalendarDays();

    if (this.selectedDate) {
      // Clear selection if it's not in the current month
      const isInCurrentMonth =
        this.selectedDate.getMonth() === this.currentMonth.getMonth() &&
        this.selectedDate.getFullYear() === this.currentMonth.getFullYear();
      if (!isInCurrentMonth) {
        this.selectedDate = null;
        this.selectedTimeSlot = null;
      }
    }
  }

  goToNextMonth() {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      1
    );
    this.generateCalendarDays();

    if (this.selectedDate) {
      // Clear selection if it's not in the current month
      const isInCurrentMonth =
        this.selectedDate.getMonth() === this.currentMonth.getMonth() &&
        this.selectedDate.getFullYear() === this.currentMonth.getFullYear();
      if (!isInCurrentMonth) {
        this.selectedDate = null;
        this.selectedTimeSlot = null;
      }
    }
  }

  // Date and time selection
  async selectDate(calendarDay: CalendarDay) {
    if (!calendarDay.isAvailable || calendarDay.isPast) return;

    this.selectedDate = calendarDay.date;
    this.selectedTimeSlot = null;

    // Update calendar days selection
    this.calendarDays.forEach((day) => {
      day.isSelected = this.isSameDay(day.date, calendarDay.date);
    });

    await this.loadAvailabilityForDate(calendarDay.date);
  }

  private async loadAvailabilityForDate(date: Date) {
    this.isLoadingAvailability = true;
    try {
      // Generate time slots (8 AM to 6 PM)
      this.timeSlots = [];
      for (let hour = 8; hour <= 18; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const timeString = `${hour.toString().padStart(2, '0')}:${minute
            .toString()
            .padStart(2, '0')}`;

          // Mock availability - in real app, this would check Firestore
          const isAvailable = Math.random() > 0.3; // 70% availability chance

          this.timeSlots.push({
            time: timeString,
            available: isAvailable,
            booked: !isAvailable,
            price: this.selectedService?.price || 100,
          });
        }
      }
    } catch (error) {
      console.error('Error loading availability:', error);
      this.showToast('Failed to load availability', 'warning');
    } finally {
      this.isLoadingAvailability = false;
    }
  }

  selectTimeSlot(timeSlot: TimeSlot) {
    if (!timeSlot.available) return;
    this.selectedTimeSlot = timeSlot;
  }

  selectService(service: BookingService) {
    this.selectedService = service;
  }

  // Address management methods
  selectAddress(address: UserLocation) {
    this.bookingForm.selectedAddressId = address.id;
    this.useCustomAddress = false;
    this.showAddressOptions = false;
  }

  toggleCustomAddress() {
    this.useCustomAddress = !this.useCustomAddress;
    if (this.useCustomAddress) {
      this.bookingForm.selectedAddressId = '';
    } else {
      this.bookingForm.customAddress = '';
    }
  }

  getSelectedAddress(): UserLocation | null {
    return (
      this.savedAddresses.find(
        (addr) => addr.id === this.bookingForm.selectedAddressId
      ) || null
    );
  }

  getCurrentAddress(): string {
    if (this.useCustomAddress) {
      return this.bookingForm.customAddress;
    }
    const selectedAddress = this.getSelectedAddress();
    return selectedAddress ? selectedAddress.fullAddress : '';
  }

  // Step navigation
  nextStep() {
    if (this.currentStep < this.totalSteps) {
      if (this.validateCurrentStep()) {
        this.currentStep++;

        // Load availability when moving to date/time step
        if (this.currentStep === 2 && this.selectedDate) {
          this.loadAvailabilityForDate(this.selectedDate);
        }
      }
    }
  }

  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  private validateCurrentStep(): boolean {
    switch (this.currentStep) {
      case 1: // Service selection
        if (!this.selectedService) {
          this.showToast('Please select a service', 'warning');
          return false;
        }
        return true;

      case 2: // Date and time selection
        if (!this.selectedDate) {
          this.showToast('Please select a date', 'warning');
          return false;
        }
        if (!this.selectedTimeSlot) {
          this.showToast('Please select a time slot', 'warning');
          return false;
        }
        return true;

      case 3: // Booking details
        const currentAddress = this.getCurrentAddress();
        if (!currentAddress.trim()) {
          this.showToast('Please select or enter an address', 'warning');
          return false;
        }
        return true;

      default:
        return true;
    }
  }

  // Booking confirmation
  async confirmBooking() {
    if (!this.validateBookingData()) return;

    const alert = await this.alertController.create({
      header: 'Confirm Booking',
      message: this.getBookingConfirmationMessage(),
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Confirm Booking',
          handler: () => this.createBooking(),
        },
      ],
    });

    await alert.present();
  }

  private validateBookingData(): boolean {
    const currentAddress = this.getCurrentAddress();
    return !!(
      this.currentUser &&
      this.worker &&
      this.selectedService &&
      this.selectedDate &&
      this.selectedTimeSlot &&
      currentAddress.trim()
    );
  }

  private getBookingConfirmationMessage(): string {
    if (!this.selectedService || !this.selectedDate || !this.selectedTimeSlot)
      return '';

    return `Service: ${this.selectedService.name}
Worker: ${this.workerName}
Date: ${this.formatDateString(this.selectedDate, 'EEEE, MMMM d, yyyy')}
Time: ${this.selectedTimeSlot.time}
Duration: ${this.selectedService.duration} minutes
Price: ₱${this.selectedService.price}
Address: ${this.getCurrentAddress()}`;
  }

  private async createBooking() {
    const loading = await this.loadingController.create({
      message: 'Creating booking...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      const bookingData: NewBookingData = {
        workerId: this.workerId,
        workerName: this.workerName,
        clientId: this.currentUser!.uid,
        serviceId: this.selectedService!.id,
        serviceName: this.selectedService!.name,
        date: this.selectedDate!,
        time: this.selectedTimeSlot!.time,
        duration: this.selectedService!.duration,
        price: this.selectedService!.price,
        address: this.getCurrentAddress(),
        notes: this.bookingForm.notes,
        status: 'pending',
        createdAt: new Date(),
      };

      // Save to Firestore bookings collection
      const bookingId = await this.firebaseBookingService.createBooking(
        bookingData
      );
      console.log('Booking created with ID:', bookingId);

      await this.showSuccessMessage();
      this.router.navigate(['/pages/my-bookings']);
    } catch (error) {
      console.error('Error creating booking:', error);
      this.showToast('Failed to create booking. Please try again.', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  private async showSuccessMessage() {
    const alert = await this.alertController.create({
      header: 'Booking Successful!',
      message: `Your booking has been confirmed. ${this.workerName} will contact you shortly to confirm the details.`,
      buttons: ['OK'],
    });
    await alert.present();
  }

  // Helper methods
  getMonthName(): string {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return `${
      months[this.currentMonth.getMonth()]
    } ${this.currentMonth.getFullYear()}`;
  }

  getCalendarWeeks(): CalendarDay[][] {
    const weeks: CalendarDay[][] = [];
    for (let i = 0; i < this.calendarDays.length; i += 7) {
      weeks.push(this.calendarDays.slice(i, i + 7));
    }
    return weeks;
  }

  getDayClasses(day: CalendarDay): string {
    let classes = 'calendar-day';

    if (!day.isCurrentMonth) classes += ' not-current-month';
    if (day.isToday) classes += ' today';
    if (day.isPast) classes += ' past';
    if (!day.isAvailable) classes += ' unavailable';
    if (day.isSelected) classes += ' selected';
    if (day.hasBookings) classes += ' has-bookings';

    return classes;
  }

  formatDate(date: Date): string {
    return this.formatDateString(date, 'EEE d');
  }

  formatFullDate(date: Date): string {
    return this.formatDateString(date, 'EEEE, MMMM d, yyyy');
  }

  getStepTitle(): string {
    switch (this.currentStep) {
      case 1:
        return 'Select Service';
      case 2:
        return 'Choose Date & Time';
      case 3:
        return 'Booking Details';
      case 4:
        return 'Confirmation';
      default:
        return '';
    }
  }

  goBack() {
    if (this.currentStep > 1) {
      this.previousStep();
    } else {
      this.router.navigate(['/client/worker-detail'], {
        queryParams: { workerId: this.workerId },
      });
    }
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  // Date utility methods

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  private isBefore(date1: Date, date2: Date): boolean {
    return date1.getTime() < date2.getTime();
  }

  private formatDateString(date: Date, format: string): string {
    const options: Intl.DateTimeFormatOptions = {};

    if (format === 'EEE d') {
      options.weekday = 'short';
      options.day = 'numeric';
    } else if (format === 'EEEE, MMMM d, yyyy') {
      options.weekday = 'long';
      options.year = 'numeric';
      options.month = 'long';
      options.day = 'numeric';
    }

    return date.toLocaleDateString('en-US', options);
  }

  /**
   * Get month year display for calendar header
   */
  getMonthYearDisplay(date: Date): string {
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }

  /**
   * Get CSS classes for calendar day
   */
  getCalendarDayClasses(day: CalendarDay): string {
    const classes = [];

    if (!day.isCurrentMonth) {
      classes.push('text-gray-300', 'cursor-not-allowed');
    } else if (day.isPast) {
      classes.push('text-gray-400', 'cursor-not-allowed');
    } else if (!day.isAvailable) {
      classes.push('text-red-400', 'cursor-not-allowed');
    } else if (day.isSelected) {
      classes.push('bg-indigo-600', 'text-white');
    } else {
      classes.push('text-gray-900', 'hover:bg-gray-100', 'cursor-pointer');
    }

    if (day.isToday) {
      classes.push('font-bold');
    }

    return classes.join(' ');
  }

  /**
   * Get CSS classes for time slot button
   */
  getTimeSlotClasses(slot: TimeSlot): string {
    const classes = [];

    if (this.selectedTimeSlot?.time === slot.time) {
      classes.push('bg-indigo-600', 'text-white', 'border-indigo-600');
    } else if (slot.available) {
      classes.push(
        'bg-white',
        'text-gray-900',
        'border-gray-300',
        'hover:bg-gray-50'
      );
    } else {
      classes.push(
        'bg-gray-100',
        'text-gray-400',
        'border-gray-200',
        'cursor-not-allowed'
      );
    }

    return classes.join(' ');
  }

  /**
   * Check if user can proceed to next step
   */
  canProceedToNextStep(): boolean {
    switch (this.currentStep) {
      case 1:
        return !!this.selectedService;
      case 2:
        return !!this.selectedDate && !!this.selectedTimeSlot;
      case 3:
        return !!(
          this.bookingForm.selectedAddressId ||
          this.bookingForm.customAddress?.trim()
        );
      case 4:
        return this.bookingForm.agreeToTerms;
      default:
        return false;
    }
  }

  /**
   * Go to previous month
   */
  previousMonth(): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() - 1,
      1
    );
    this.generateCalendarDays();
  }

  /**
   * Go to next month
   */
  nextMonth(): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      1
    );
    this.generateCalendarDays();
  }

  /**
   * Get worker image source URL from base64 data
   * Handles different image formats automatically
   */
  getWorkerImageSrc(base64Data: string | undefined): string {
    if (!base64Data) {
      return '';
    }

    // Check if the base64 data already includes the data URI prefix
    if (base64Data.startsWith('data:image/')) {
      return base64Data;
    }

    // Detect image format based on base64 header or default to jpeg
    let mimeType = 'image/jpeg';

    // Check for common image format signatures in base64
    if (base64Data.startsWith('/9j/')) {
      mimeType = 'image/jpeg';
    } else if (base64Data.startsWith('iVBORw0KGgo')) {
      mimeType = 'image/png';
    } else if (base64Data.startsWith('R0lGOD')) {
      mimeType = 'image/gif';
    } else if (base64Data.startsWith('UklGR')) {
      mimeType = 'image/webp';
    }

    return `data:${mimeType};base64,${base64Data}`;
  }

  /**
   * Handle worker image load error
   */
  onWorkerImageError(event: any): void {
    console.warn('Failed to load worker ID photo:', event);
    this.workerImageLoadError = true;
  }
}
