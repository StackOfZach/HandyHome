import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  LoadingController,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
// Camera functionality using HTML5 API for web compatibility

// Services
import { AuthService } from '../../../services/auth.service';
import { WorkerService } from '../../../services/worker.service';
import {
  DashboardService,
  ServiceCategory,
} from '../../../services/dashboard.service';

// Components - MapPickerComponent COMMENTED OUT
// import { MapPickerComponent } from '../../../components/map-picker/map-picker.component';

// Interfaces
export interface SubServicePrice {
  subServiceName: string;
  price: number;
}

export interface ServiceWithPricing {
  categoryName: string;
  subServices: SubServicePrice[];
}

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
  servicePrices?: ServicePrice[]; // Legacy - Service pricing information
  serviceWithPricing?: ServiceWithPricing[]; // New - Detailed sub-service pricing
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
  createdAt: Date;
  currentStep?: number;
  emergencyContact?: string;
  emergencyPhone?: string;
  interviewCompletedAt?: Date;
  verifiedAt?: Date;
  updatedAt?: Date;
}

@Component({
  selector: 'app-interview',
  templateUrl: './interview.page.html',
  styleUrls: ['./interview.page.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonicModule], // MapPickerComponent removed
})
export class InterviewPage implements OnInit, OnDestroy {
  currentStep = 1;
  totalSteps = 5;

  // Form groups for each step
  personalInfoForm!: FormGroup;
  skillsForm!: FormGroup;
  certificateForm!: FormGroup;
  verificationForm!: FormGroup;

  // Worker profile data
  workerProfile: Partial<WorkerProfile> = {};

  // Loading states
  isLoading = false;
  isSaving = false;

  // Map related - COMMENTED OUT
  // mapReady = false;
  // selectedLocation: { lat: number; lng: number } | null = null;

  // Skills and services
  serviceCategories: ServiceCategory[] = [];
  availableServices: string[] = [];
  isLoadingServices = false;

  // Available days
  availableDays = [
    { value: 'monday', label: 'Monday', icon: 'calendar' },
    { value: 'tuesday', label: 'Tuesday', icon: 'calendar' },
    { value: 'wednesday', label: 'Wednesday', icon: 'calendar' },
    { value: 'thursday', label: 'Thursday', icon: 'calendar' },
    { value: 'friday', label: 'Friday', icon: 'calendar' },
    { value: 'saturday', label: 'Saturday', icon: 'calendar' },
    { value: 'sunday', label: 'Sunday', icon: 'calendar' },
  ];

  // Time availability for each day
  timeAvailability: { [key: string]: { startTime: string; endTime: string } } =
    {};

  // Photo previews
  idPhotoPreview: string | null = null;
  profilePhotoPreview: string | null = null;

  // Certificate related
  selectedSkills: string[] = [];
  certificatePreviews: { [skillName: string]: string } = {};

  // Service pricing - Legacy
  servicePrices: { [skillName: string]: { min: number; max: number } } = {};

  // Sub-service management
  selectedServicesWithSubs: { [categoryName: string]: string[] } = {};
  serviceSubCategoryPricing: {
    [categoryName: string]: { [subService: string]: number };
  } = {};

  private subscriptions = new Subscription();

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private workerService: WorkerService,
    private dashboardService: DashboardService,
    private router: Router,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private toastController: ToastController
  ) {
    this.initializeForms();
  }

  ngOnInit() {
    this.loadWorkerProfile();
    this.loadServiceCategories();
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  /**
   * Initialize all form groups
   */
  private initializeForms() {
    // Step 1: Personal Information
    this.personalInfoForm = this.fb.group({
      fullAddress: ['', [Validators.required, Validators.minLength(10)]],
      phone: [
        '',
        [
          Validators.required,
          Validators.pattern(/^[0-9]{11}$/),
          Validators.minLength(11),
          Validators.maxLength(11),
        ],
      ],
      emergencyContact: ['', [Validators.required]],
      emergencyPhone: [
        '',
        [
          Validators.required,
          Validators.pattern(/^[0-9]{11}$/),
          Validators.minLength(11),
          Validators.maxLength(11),
        ],
      ],
    });

    // Step 2: Skills & Services
    this.skillsForm = this.fb.group({
      skills: [[], Validators.required],
      customSkill: [''],
      workRadius: [
        5,
        [Validators.required, Validators.min(1), Validators.max(50)],
      ],
      availableDays: [[], Validators.required],
    });

    // Step 3: Certificate Upload
    this.certificateForm = this.fb.group({});

    // Step 4: Identity Verification
    this.verificationForm = this.fb.group({
      idPhoto: [null, Validators.required],
      profilePhoto: [null, Validators.required],
    });
  }

  /**
   * Load existing worker profile if any
   */
  private async loadWorkerProfile() {
    const loading = await this.loadingController.create({
      message: 'Loading profile...',
    });
    await loading.present();

    try {
      const user = this.authService.getCurrentUser();
      if (!user) {
        this.router.navigate(['/pages/auth/login']);
        return;
      }

      const profile = await this.workerService.getWorkerProfile(user.uid);
      if (profile) {
        // Check if worker is already verified and completed interview
        if (profile.verifiedAt && profile.status === 'verified') {
          console.log('Worker is already verified, redirecting to dashboard');
          this.router.navigate(['/pages/worker/dashboard']);
          return;
        }

        this.workerProfile = profile;
        this.currentStep = profile.currentStep || 1;
        this.populateFormsFromProfile(profile);
      } else {
        // Initialize with basic info from auth service
        const userProfile = this.authService.getCurrentUserProfile();
        if (userProfile) {
          this.workerProfile = {
            uid: userProfile.uid,
            fullName: userProfile.fullName,
            email: userProfile.email,
            phone: userProfile.phone,
            currentStep: 1,
            status: 'pending_verification',
            createdAt: new Date(),
          };

          // Populate the phone number in the form from registration data
          console.log('Populating phone from registration:', userProfile.phone);
          this.personalInfoForm.patchValue({
            phone: userProfile.phone || '',
          });
        }
      }
    } catch (error) {
      console.error('Error loading worker profile:', error);
      this.showErrorAlert('Failed to load profile');
    } finally {
      loading.dismiss();
    }
  }

  /**
   * Load service categories from Firestore
   */
  async loadServiceCategories() {
    this.isLoadingServices = true;
    try {
      this.serviceCategories =
        await this.dashboardService.getServiceCategories();
      // Extract only the names of active service categories for the availableServices array
      this.availableServices = this.serviceCategories
        .filter((category) => category.isActive)
        .map((category) => category.name);
      console.log('Loaded service categories:', this.serviceCategories);
      console.log('Available services:', this.availableServices);
    } catch (error) {
      console.error('Error loading service categories:', error);
      // Fallback to hardcoded services if Firestore fails
      this.availableServices = [
        'House Cleaning',
        'Plumbing',
        'Electrical Work',
        'Carpentry',
        'Painting',
        'Gardening',
        'Appliance Repair',
        'AC Maintenance',
        'Pest Control',
        'Home Security',
        'Moving Services',
        'General Handyman',
      ];
    } finally {
      this.isLoadingServices = false;
    }
  }

  /**
   * Populate forms with existing profile data
   */
  private populateFormsFromProfile(profile: WorkerProfile) {
    // Personal info form
    this.personalInfoForm.patchValue({
      fullAddress: profile.fullAddress || '',
      phone: profile.phone || '',
      emergencyContact: profile.emergencyContact || '',
      emergencyPhone: profile.emergencyPhone || '',
    });

    // Skills form
    this.skillsForm.patchValue({
      skills: profile.skills || [],
      workRadius: profile.workRadius || 5,
      availableDays: profile.availableDays || [],
    });

    // Load time availability
    if (profile.timeAvailability) {
      this.timeAvailability = { ...profile.timeAvailability };
    }

    // Update selected skills for certificate form
    this.selectedSkills = profile.skills || [];
    this.updateCertificateForm();

    // Certificate form - restore certificate previews if they exist
    if (profile.certificates) {
      this.certificatePreviews = profile.certificates;
    }

    // Service prices - restore pricing if they exist
    if (profile.servicePrices) {
      profile.servicePrices.forEach((priceData) => {
        this.servicePrices[priceData.name] = {
          min: priceData.minPrice,
          max: priceData.maxPrice,
        };
      });
    }

    // Update certificate form after loading data
    if (profile.certificates || profile.servicePrices) {
      this.updateCertificateForm();
    }

    // Verification form - restore photo previews if they exist
    if (profile.idPhotoData) {
      this.idPhotoPreview = profile.idPhotoData;
      this.verificationForm.patchValue({
        idPhoto: profile.idPhotoData,
      });
    }

    if (profile.profilePhotoData) {
      this.profilePhotoPreview = profile.profilePhotoData;
      this.verificationForm.patchValue({
        profilePhoto: profile.profilePhotoData,
      });
    }

    // Set selected location - COMMENTED OUT
    // if (profile.location) {
    //   this.selectedLocation = profile.location;
    // }

    console.log('Populated forms with profile data:', profile);
  }

  /**
   * Navigate to next step
   */
  async nextStep() {
    if (await this.validateCurrentStep()) {
      await this.saveCurrentStep();
      if (this.currentStep < this.totalSteps) {
        this.currentStep++;
      }
    }
  }

  /**
   * Navigate to previous step
   */
  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  /**
   * Go back to previous page
   */
  goBack() {
    this.router.navigate(['/pages/auth/login']);
  }

  /**
   * Validate current step form
   */
  private async validateCurrentStep(): Promise<boolean> {
    switch (this.currentStep) {
      case 1:
        if (!this.personalInfoForm.valid) {
          this.showValidationErrors(this.personalInfoForm);
          return false;
        }
        // Location validation - COMMENTED OUT
        // if (!this.selectedLocation) {
        //   this.showErrorToast('Please pin your location on the map');
        //   return false;
        // }
        return true;

      case 2:
        if (!this.skillsForm.valid) {
          this.showValidationErrors(this.skillsForm);
          return false;
        }
        const skills = this.skillsForm.get('skills')?.value;
        if (!skills || skills.length === 0) {
          this.showErrorToast('Please select at least one skill');
          return false;
        }
        const availableDays = this.skillsForm.get('availableDays')?.value;
        if (!availableDays || availableDays.length === 0) {
          this.showErrorToast('Please select at least one day of availability');
          return false;
        }
        return true;

      case 3:
        // Validate certificates for selected skills that require them
        const selectedSkills = this.skillsForm.get('skills')?.value || [];
        for (const skill of selectedSkills) {
          // Only validate certificate if the service requires it
          const requiresCertificate = this.doesSkillRequireCertificate(skill);
          if (requiresCertificate && !this.certificateForm.get(skill)?.value) {
            this.showErrorToast(`Please upload certificate for ${skill}`);
            return false;
          }
        }
        return true;

      case 4:
        if (!this.verificationForm.valid) {
          this.showValidationErrors(this.verificationForm);
          return false;
        }
        return true;

      default:
        return true;
    }
  }

  /**
   * Save current step data
   */
  private async saveCurrentStep() {
    const loading = await this.loadingController.create({
      message: 'Saving...',
    });
    await loading.present();

    try {
      const updateData: Partial<WorkerProfile> = {
        currentStep: this.currentStep,
        updatedAt: new Date(),
      };

      switch (this.currentStep) {
        case 1:
          const personalData = this.personalInfoForm.value;
          updateData.fullAddress = personalData.fullAddress;
          updateData.phone = personalData.phone;
          // updateData.location = this.selectedLocation!; // COMMENTED OUT
          updateData.emergencyContact = personalData.emergencyContact;
          updateData.emergencyPhone = personalData.emergencyPhone;
          console.log('Saving Step 1 data:', updateData);
          break;

        case 2:
          const skillsData = this.skillsForm.value;
          updateData.skills = [...(skillsData.skills || [])];
          updateData.workRadius = skillsData.workRadius;
          updateData.availableDays = [...(skillsData.availableDays || [])];
          updateData.timeAvailability = { ...this.timeAvailability };

          // Add custom skill if provided
          if (skillsData.customSkill && skillsData.customSkill.trim()) {
            updateData.skills = [
              ...(updateData.skills || []),
              skillsData.customSkill.trim(),
            ];
          }
          console.log('Saving Step 2 data:', updateData);
          break;

        case 3:
          // Save certificate data only
          const certificateData = this.certificateForm.value;

          // Extract certificates only (remove any pricing fields if they exist)
          const certificates: any = {};
          Object.keys(certificateData).forEach((key) => {
            if (!key.endsWith('_minPrice') && !key.endsWith('_maxPrice')) {
              // Handle certificate files only
              certificates[key] = certificateData[key];
            }
          });

          updateData.certificates = certificates;
          console.log('Saving Step 3 data (certificates only):', updateData);
          break;

        case 4:
          // Save photo data temporarily as base64
          const verificationData = this.verificationForm.value;
          if (verificationData.idPhoto) {
            updateData.idPhotoData = verificationData.idPhoto;
          }
          if (verificationData.profilePhoto) {
            updateData.profilePhotoData = verificationData.profilePhoto;
          }
          console.log('Saving Step 4 data (photos saved as base64)');
          break;
      }

      await this.workerService.updateWorkerProfile(
        this.workerProfile.uid!,
        updateData
      );
      this.workerProfile = { ...this.workerProfile, ...updateData };

      this.showSuccessToast('Progress saved successfully');
    } catch (error) {
      console.error('Error saving profile:', error);
      this.showErrorAlert('Failed to save progress');
      throw error;
    } finally {
      loading.dismiss();
    }
  }

  /**
   * Handle map location selection - COMMENTED OUT
   */
  // onLocationSelected(location: { lat: number; lng: number }) {
  //   this.selectedLocation = location;
  // }

  /**
   * Get progress percentage
   */
  getProgressPercentage(): number {
    return (this.currentStep / this.totalSteps) * 100;
  }

  /**
   * Show validation errors
   */
  private showValidationErrors(form: FormGroup) {
    Object.keys(form.controls).forEach((key) => {
      const control = form.get(key);
      if (control && control.invalid) {
        control.markAsTouched();
      }
    });
  }

  /**
   * Show error alert
   */
  private async showErrorAlert(message: string) {
    const alert = await this.alertController.create({
      header: 'Error',
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  /**
   * Show success toast
   */
  private async showSuccessToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color: 'success',
      position: 'bottom',
    });
    await toast.present();
  }

  /**
   * Show error toast
   */
  private async showErrorToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  }

  /**
   * Validate all interview data before submission
   */
  private validateAllData(): boolean {
    // Check personal information
    if (!this.personalInfoForm.valid) {
      console.error(
        'Personal info form is invalid:',
        this.personalInfoForm.errors
      );
      return false;
    }

    // Location validation - COMMENTED OUT
    // if (!this.selectedLocation) {
    //   console.error('Location not selected');
    //   return false;
    // }

    // Check skills and availability
    if (!this.skillsForm.valid) {
      console.error('Skills form is invalid:', this.skillsForm.errors);
      return false;
    }

    const skills = this.skillsForm.get('skills')?.value;
    if (!skills || skills.length === 0) {
      console.error('No skills selected');
      return false;
    }

    const availableDays = this.skillsForm.get('availableDays')?.value;
    if (!availableDays || availableDays.length === 0) {
      console.error('No available days selected');
      return false;
    }

    // Check verification photos
    if (!this.verificationForm.valid) {
      console.error(
        'Verification form is invalid:',
        this.verificationForm.errors
      );
      return false;
    }

    if (!this.idPhotoPreview || !this.profilePhotoPreview) {
      console.error('Photos missing');
      return false;
    }

    return true;
  }

  /**
   * Get all interview data for debugging
   */
  getAllInterviewData() {
    return {
      personalInfo: this.personalInfoForm.value,
      skills: this.skillsForm.value,
      verification: {
        hasIdPhoto: !!this.idPhotoPreview,
        hasProfilePhoto: !!this.profilePhotoPreview,
      },
      // location: this.selectedLocation, // COMMENTED OUT
      workerProfile: this.workerProfile,
      currentStep: this.currentStep,
    };
  }

  /**
   * Toggle skill selection (limited to 3 services maximum)
   */
  toggleSkill(skill: string) {
    const currentSkills = this.skillsForm.get('skills')?.value || [];
    const index = currentSkills.indexOf(skill);

    if (index > -1) {
      // Remove skill
      currentSkills.splice(index, 1);
      // Remove sub-services and pricing for this skill
      delete this.selectedServicesWithSubs[skill];
      delete this.serviceSubCategoryPricing[skill];
    } else {
      // Check if we can add more skills (limit to 3)
      if (currentSkills.length < 3) {
        // Add skill
        currentSkills.push(skill);
        // Initialize sub-services array for this skill
        this.selectedServicesWithSubs[skill] = [];
        this.serviceSubCategoryPricing[skill] = {};
      } else {
        // Show toast message when limit is reached
        this.showToast(
          'You can select a maximum of 3 services only.',
          'warning'
        );
        return;
      }
    }

    this.skillsForm.patchValue({ skills: currentSkills });

    // Update selected skills and certificate form
    this.selectedSkills = currentSkills;
    this.updateCertificateForm();
  }

  /**
   * Check if skill is selected
   */
  isSkillSelected(skill: string): boolean {
    const currentSkills = this.skillsForm.get('skills')?.value || [];
    return currentSkills.includes(skill);
  }

  /**
   * Get selected skills array
   */
  getSelectedSkills(): string[] {
    return this.skillsForm.get('skills')?.value || [];
  }

  /**
   * Check if maximum service selection limit is reached
   */
  isSelectionLimitReached(): boolean {
    return this.getSelectedSkills().length >= 3;
  }

  /**
   * Get sub-services for a given service category
   */
  getSubServicesForCategory(categoryName: string): string[] {
    const category = this.serviceCategories.find(
      (cat) => cat.name === categoryName
    );
    return category?.services || [];
  }

  /**
   * Toggle sub-service selection for a category
   */
  toggleSubService(categoryName: string, subService: string) {
    if (!this.selectedServicesWithSubs[categoryName]) {
      this.selectedServicesWithSubs[categoryName] = [];
    }

    const subServices = this.selectedServicesWithSubs[categoryName];
    const index = subServices.indexOf(subService);

    if (index > -1) {
      // Remove sub-service
      subServices.splice(index, 1);
      // Remove pricing for this sub-service
      if (this.serviceSubCategoryPricing[categoryName]) {
        delete this.serviceSubCategoryPricing[categoryName][subService];
      }
    } else {
      // Add sub-service
      subServices.push(subService);
      // Initialize pricing for this sub-service
      if (!this.serviceSubCategoryPricing[categoryName]) {
        this.serviceSubCategoryPricing[categoryName] = {};
      }
      this.serviceSubCategoryPricing[categoryName][subService] = 0;
    }
  }

  /**
   * Check if sub-service is selected
   */
  isSubServiceSelected(categoryName: string, subService: string): boolean {
    return (
      this.selectedServicesWithSubs[categoryName]?.includes(subService) || false
    );
  }

  /**
   * Update pricing for a specific sub-service
   */
  updateSubServicePrice(
    categoryName: string,
    subService: string,
    price: number
  ) {
    if (!this.serviceSubCategoryPricing[categoryName]) {
      this.serviceSubCategoryPricing[categoryName] = {};
    }
    this.serviceSubCategoryPricing[categoryName][subService] = price;
  }

  /**
   * Get pricing for a specific sub-service
   */
  getSubServicePrice(categoryName: string, subService: string): number {
    return this.serviceSubCategoryPricing[categoryName]?.[subService] || 0;
  }

  /**
   * Get unit pricing for a specific sub-service from service categories
   */
  getSubServiceUnit(categoryName: string, subService: string): string {
    const category = this.serviceCategories.find(
      (cat) => cat.name === categoryName
    );
    if (!category || !category.services || !category.servicesPricing) {
      return 'hour'; // Default fallback
    }

    const subServiceIndex = category.services.indexOf(subService);
    if (subServiceIndex === -1 || !category.servicesPricing[subServiceIndex]) {
      return 'hour'; // Default fallback
    }

    return category.servicesPricing[subServiceIndex] === 'per_hour'
      ? 'hour'
      : 'day';
  }

  /**
   * Get all selected sub-services for a category
   */
  getSelectedSubServices(categoryName: string): string[] {
    return this.selectedServicesWithSubs[categoryName] || [];
  }

  /**
   * Toggle day availability
   */
  toggleDay(day: string) {
    const currentDays = this.skillsForm.get('availableDays')?.value || [];
    const dayIndex = currentDays.indexOf(day);

    if (dayIndex > -1) {
      // Remove day and its time availability
      currentDays.splice(dayIndex, 1);
      delete this.timeAvailability[day];
    } else {
      // Add day with default time availability
      currentDays.push(day);
      this.timeAvailability[day] = {
        startTime: '08:00',
        endTime: '17:00',
      };
    }

    this.skillsForm.patchValue({ availableDays: currentDays });
  }

  /**
   * Check if a skill requires certificate upload
   */
  doesSkillRequireCertificate(skill: string): boolean {
    const serviceCategory = this.serviceCategories.find(
      (cat) => cat.name === skill
    );
    return serviceCategory?.requiresCertificate || false;
  }

  /**
   * Get skills that require certificates from selected skills
   */
  getSkillsWithCertificateRequirement(): string[] {
    return this.selectedSkills.filter((skill) =>
      this.doesSkillRequireCertificate(skill)
    );
  }

  /**
   * Check if any selected skill requires certificate
   */
  hasSkillsRequiringCertificate(): boolean {
    return this.getSkillsWithCertificateRequirement().length > 0;
  }

  /**
   * Check if day is selected
   */
  isDaySelected(day: string): boolean {
    const currentDays = this.skillsForm.get('availableDays')?.value || [];
    return currentDays.includes(day);
  }

  /**
   * Get selected days array
   */
  getSelectedDays(): string[] {
    return this.skillsForm.get('availableDays')?.value || [];
  }

  /**
   * Update certificate form based on selected skills
   */
  updateCertificateForm() {
    const certificateControls: any = {};

    // Create form controls for each selected skill
    this.selectedSkills.forEach((skill) => {
      // Check if this service requires certificate
      const serviceCategory = this.serviceCategories.find(
        (cat) => cat.name === skill
      );
      const requiresCertificate = serviceCategory?.requiresCertificate || false;

      // Only add certificate control if service requires it
      if (requiresCertificate) {
        const existingValue = this.certificatePreviews[skill] || null;
        certificateControls[skill] = [existingValue, Validators.required];
      }
    });

    // Remove certificates for unselected skills
    Object.keys(this.certificatePreviews).forEach((skill) => {
      if (!this.selectedSkills.includes(skill)) {
        delete this.certificatePreviews[skill];
      }
    });

    this.certificateForm = this.fb.group(certificateControls);
  }

  /**
   * Upload certificate for a specific skill
   */
  async uploadCertificate(skillName: string) {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.multiple = false;

      input.onchange = async (event: any) => {
        const file = event.target.files[0];
        if (file) {
          try {
            if (file.type && file.type.startsWith('image/')) {
              const dataUrl = await this.readFileAsDataUrl(file);
              const compressed = await this.compressDataUrl(
                dataUrl,
                1400,
                1400,
                0.7
              );
              this.certificatePreviews[skillName] = compressed;
              this.certificateForm.get(skillName)?.setValue(compressed);
            } else {
              const dataUrl = await this.readFileAsDataUrl(file);
              this.certificatePreviews[skillName] = dataUrl;
              this.certificateForm.get(skillName)?.setValue(dataUrl);
            }
            this.showSuccessToast(
              `Certificate for ${skillName} uploaded successfully`
            );
          } catch (err) {
            console.error('Certificate processing failed:', err);
            this.showErrorToast('Failed to process file. Please try again.');
          }
        }
      };

      input.click();
    } catch (error: any) {
      console.error('Error uploading certificate:', error);
      this.showErrorToast('Failed to upload certificate. Please try again.');
    }
  }

  /**
   * Check if certificate is uploaded for a skill
   */
  isCertificateUploaded(skillName: string): boolean {
    return !!this.certificatePreviews[skillName];
  }

  /**
   * Get certificate requirement text for a skill
   */
  getCertificateRequirement(skillName: string): string {
    const serviceCategory = this.serviceCategories.find(
      (cat) => cat.name === skillName
    );
    if (serviceCategory?.requiresCertificate) {
      return 'Valid certification, license, or training certificate required for this service';
    }
    return 'No certificate required for this service';
  }

  /**
   * Remove uploaded certificate for a skill
   */
  removeCertificate(skillName: string) {
    delete this.certificatePreviews[skillName];
    this.certificateForm.get(skillName)?.setValue(null);
    this.showSuccessToast(`Certificate for ${skillName} removed`);
  }

  /**
   * Get uploaded certificates count
   */
  getUploadedCertificatesCount(): number {
    return Object.keys(this.certificatePreviews).length;
  }

  /**
   * Check if all required certificates are uploaded
   */
  areAllCertificatesUploaded(): boolean {
    return (
      Object.keys(this.certificatePreviews).length ===
      this.selectedSkills.length
    );
  }

  /**
   * Get certificates keys for iteration in template
   */
  getCertificateKeys(): string[] {
    return Object.keys(this.certificatePreviews);
  }

  /**
   * Capture ID photo using camera
   */
  async captureIdPhoto() {
    try {
      // Create a file input element for camera access
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment'; // Use back camera for ID photos

      input.onchange = async (event: any) => {
        const file = event.target.files[0];
        if (file) {
          try {
            const dataUrl = await this.readFileAsDataUrl(file);
            const compressed = await this.compressDataUrl(
              dataUrl,
              1024,
              1024,
              0.7
            );
            this.idPhotoPreview = compressed;
            this.verificationForm.patchValue({ idPhoto: compressed });
            this.showSuccessToast('ID photo captured successfully');
          } catch (err) {
            console.error('Compression failed for ID photo:', err);
            this.showErrorToast('Failed to process image. Please try again.');
          }
        }
      };

      input.click();
    } catch (error: any) {
      console.error('Error capturing ID photo:', error);
      this.showErrorToast('Failed to access camera. Please try again.');
    }
  }

  /**
   * Capture profile photo using camera
   */
  async captureProfilePhoto() {
    try {
      // Create a file input element for camera access
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'user'; // Use front camera for selfies

      input.onchange = async (event: any) => {
        const file = event.target.files[0];
        if (file) {
          try {
            const dataUrl = await this.readFileAsDataUrl(file);
            const compressed = await this.compressDataUrl(
              dataUrl,
              1024,
              1024,
              0.7
            );
            this.profilePhotoPreview = compressed;
            this.verificationForm.patchValue({ profilePhoto: compressed });
            this.showSuccessToast('Profile photo captured successfully');
          } catch (err) {
            console.error('Compression failed for profile photo:', err);
            this.showErrorToast('Failed to process image. Please try again.');
          }
        }
      };

      input.click();
    } catch (error: any) {
      console.error('Error capturing profile photo:', error);
      this.showErrorToast('Failed to access camera. Please try again.');
    }
  }

  /**
   * Submit completed interview
   */
  async submitInterview() {
    if (!(await this.validateCurrentStep())) {
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Submitting application...',
    });
    await loading.present();

    try {
      // Save final step data first
      await this.saveCurrentStep();

      // Prepare final submission data with all interview information
      const finalSubmissionData: Partial<WorkerProfile> = {
        currentStep: 5,
        status: 'pending_verification',
        interviewCompletedAt: new Date(),
        updatedAt: new Date(),

        // Include all completed data
        fullAddress: this.personalInfoForm.get('fullAddress')?.value,
        phone: this.personalInfoForm.get('phone')?.value,
        emergencyContact: this.personalInfoForm.get('emergencyContact')?.value,
        emergencyPhone: this.personalInfoForm.get('emergencyPhone')?.value,
        // location: this.selectedLocation!, // COMMENTED OUT

        skills: this.skillsForm.get('skills')?.value || [],
        workRadius: this.skillsForm.get('workRadius')?.value || 5,
        availableDays: this.skillsForm.get('availableDays')?.value || [],
        timeAvailability: { ...this.timeAvailability },

        certificates: this.certificateForm.value || {},

        idPhotoData: this.verificationForm.get('idPhoto')?.value,
        profilePhotoData: this.verificationForm.get('profilePhoto')?.value,
      };

      // Add service pricing data (legacy format for backward compatibility)
      const servicePricesArray: ServicePrice[] = [];
      Object.keys(this.servicePrices).forEach((skillName) => {
        const pricing = this.servicePrices[skillName];
        if (pricing.min > 0 || pricing.max > 0) {
          servicePricesArray.push({
            name: skillName,
            minPrice: pricing.min,
            maxPrice: pricing.max,
          });
        }
      });

      if (servicePricesArray.length > 0) {
        finalSubmissionData.servicePrices = servicePricesArray;
      }

      // Add new sub-service pricing data
      const serviceWithPricingArray: ServiceWithPricing[] = [];
      Object.keys(this.serviceSubCategoryPricing).forEach((categoryName) => {
        const subServicePricing = this.serviceSubCategoryPricing[categoryName];
        const subServices: SubServicePrice[] = [];

        Object.keys(subServicePricing).forEach((subServiceName) => {
          const price = subServicePricing[subServiceName];
          if (price > 0) {
            subServices.push({
              subServiceName,
              price,
            });
          }
        });

        if (subServices.length > 0) {
          serviceWithPricingArray.push({
            categoryName,
            subServices,
          });
        }
      });

      if (serviceWithPricingArray.length > 0) {
        finalSubmissionData.serviceWithPricing = serviceWithPricingArray;
      }

      // Add custom skill if provided
      const customSkill = this.skillsForm.get('customSkill')?.value;
      if (customSkill && customSkill.trim()) {
        finalSubmissionData.skills = [
          ...(finalSubmissionData.skills || []),
          customSkill.trim(),
        ];
      }

      console.log('Final submission data:', finalSubmissionData);

      // Complete the interview process with all data
      await this.workerService.updateWorkerProfile(
        this.workerProfile.uid!,
        finalSubmissionData
      );

      loading.dismiss();

      // Show success message and logout
      const alert = await this.alertController.create({
        header: 'Application Submitted!',
        message:
          'Your worker application has been submitted successfully. You will be notified once it has been reviewed by our team. Please log in again to check your application status.',
        buttons: [
          {
            text: 'OK',
            handler: async () => {
              try {
                // Log out the user to clear their session
                await this.authService.logout();
              } catch (error) {
                console.error('Error during logout:', error);
                // Fallback to manual navigation if logout fails
                this.router.navigate(['/pages/auth/login']);
              }
            },
          },
        ],
      });
      await alert.present();
    } catch (error) {
      loading.dismiss();
      console.error('Error submitting interview:', error);
      this.showErrorAlert('Failed to submit application. Please try again.');
    }
  }

  /**
   * Show toast message
   */
  private async showToast(
    message: string,
    color: 'success' | 'warning' | 'danger' = 'success'
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  private compressDataUrl(
    dataUrl: string,
    maxWidth: number,
    maxHeight: number,
    quality: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const originalWidth = img.width;
        const originalHeight = img.height;

        const widthRatio = maxWidth / originalWidth;
        const heightRatio = maxHeight / originalHeight;
        const scale = Math.min(1, widthRatio, heightRatio);

        const targetWidth = Math.floor(originalWidth * scale);
        const targetHeight = Math.floor(originalHeight * scale);

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.onerror = (e) => reject(e);
      img.src = dataUrl;
    });
  }

  /**
   * Update time availability for a specific day
   */
  updateTimeAvailability(
    day: string,
    timeType: 'startTime' | 'endTime',
    value: string
  ) {
    if (!this.timeAvailability[day]) {
      this.timeAvailability[day] = { startTime: '08:00', endTime: '17:00' };
    }
    this.timeAvailability[day][timeType] = value;
  }

  /**
   * Get time availability for a day
   */
  getTimeAvailability(day: string): { startTime: string; endTime: string } {
    return (
      this.timeAvailability[day] || { startTime: '08:00', endTime: '17:00' }
    );
  }
}
