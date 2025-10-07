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

// Components
import { MapPickerComponent } from '../../../components/map-picker/map-picker.component';

// Interfaces
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
  imports: [CommonModule, ReactiveFormsModule, IonicModule, MapPickerComponent],
})
export class InterviewPage implements OnInit, OnDestroy {
  currentStep = 1;
  totalSteps = 4;

  // Form groups for each step
  personalInfoForm!: FormGroup;
  skillsForm!: FormGroup;
  verificationForm!: FormGroup;

  // Worker profile data
  workerProfile: Partial<WorkerProfile> = {};

  // Loading states
  isLoading = false;
  isSaving = false;

  // Map related
  mapReady = false;
  selectedLocation: { lat: number; lng: number } | null = null;

  // Skills and services
  availableServices = [
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

  // Photo previews
  idPhotoPreview: string | null = null;
  profilePhotoPreview: string | null = null;

  private subscriptions = new Subscription();

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private workerService: WorkerService,
    private router: Router,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private toastController: ToastController
  ) {
    this.initializeForms();
  }

  ngOnInit() {
    this.loadWorkerProfile();
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
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10,11}$/)]],
      emergencyContact: ['', [Validators.required]],
      emergencyPhone: [
        '',
        [Validators.required, Validators.pattern(/^[0-9]{10,11}$/)],
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

    // Step 3: Identity Verification
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

    // Set selected location
    if (profile.location) {
      this.selectedLocation = profile.location;
    }

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
        if (!this.selectedLocation) {
          this.showErrorToast('Please pin your location on the map');
          return false;
        }
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
          updateData.location = this.selectedLocation!;
          updateData.emergencyContact = personalData.emergencyContact;
          updateData.emergencyPhone = personalData.emergencyPhone;
          console.log('Saving Step 1 data:', updateData);
          break;

        case 2:
          const skillsData = this.skillsForm.value;
          updateData.skills = [...(skillsData.skills || [])];
          updateData.workRadius = skillsData.workRadius;
          updateData.availableDays = [...(skillsData.availableDays || [])];

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
          // Save photo data temporarily as base64
          const verificationData = this.verificationForm.value;
          if (verificationData.idPhoto) {
            updateData.idPhotoData = verificationData.idPhoto;
          }
          if (verificationData.profilePhoto) {
            updateData.profilePhotoData = verificationData.profilePhoto;
          }
          console.log('Saving Step 3 data (photos saved as base64)');
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
   * Handle map location selection
   */
  onLocationSelected(location: { lat: number; lng: number }) {
    this.selectedLocation = location;
  }

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

    if (!this.selectedLocation) {
      console.error('Location not selected');
      return false;
    }

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
      location: this.selectedLocation,
      workerProfile: this.workerProfile,
      currentStep: this.currentStep,
    };
  }

  /**
   * Toggle skill selection
   */
  toggleSkill(skill: string) {
    const currentSkills = this.skillsForm.get('skills')?.value || [];
    const index = currentSkills.indexOf(skill);

    if (index > -1) {
      // Remove skill
      currentSkills.splice(index, 1);
    } else {
      // Add skill
      currentSkills.push(skill);
    }

    this.skillsForm.patchValue({ skills: currentSkills });
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
   * Toggle day availability
   */
  toggleDay(day: string) {
    const currentDays = this.skillsForm.get('availableDays')?.value || [];
    const dayIndex = currentDays.indexOf(day);

    if (dayIndex > -1) {
      currentDays.splice(dayIndex, 1);
    } else {
      currentDays.push(day);
    }

    this.skillsForm.patchValue({ availableDays: currentDays });
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
   * Capture ID photo using camera
   */
  async captureIdPhoto() {
    try {
      // Create a file input element for camera access
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment'; // Use back camera for ID photos

      input.onchange = (event: any) => {
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e: any) => {
            this.idPhotoPreview = e.target.result;
            this.verificationForm.patchValue({ idPhoto: e.target.result });
            this.showSuccessToast('ID photo captured successfully');
          };
          reader.readAsDataURL(file);
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

      input.onchange = (event: any) => {
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e: any) => {
            this.profilePhotoPreview = e.target.result;
            this.verificationForm.patchValue({ profilePhoto: e.target.result });
            this.showSuccessToast('Profile photo captured successfully');
          };
          reader.readAsDataURL(file);
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
        currentStep: 4,
        status: 'pending_verification',
        interviewCompletedAt: new Date(),
        updatedAt: new Date(),

        // Include all completed data
        fullAddress: this.personalInfoForm.get('fullAddress')?.value,
        phone: this.personalInfoForm.get('phone')?.value,
        emergencyContact: this.personalInfoForm.get('emergencyContact')?.value,
        emergencyPhone: this.personalInfoForm.get('emergencyPhone')?.value,
        location: this.selectedLocation!,

        skills: this.skillsForm.get('skills')?.value || [],
        workRadius: this.skillsForm.get('workRadius')?.value || 5,
        availableDays: this.skillsForm.get('availableDays')?.value || [],

        idPhotoData: this.verificationForm.get('idPhoto')?.value,
        profilePhotoData: this.verificationForm.get('profilePhoto')?.value,
      };

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

      // Show success message
      const alert = await this.alertController.create({
        header: 'Application Submitted!',
        message:
          'Your worker application has been submitted successfully. You will be notified once it has been reviewed by our team.',
        buttons: [
          {
            text: 'OK',
            handler: () => {
              this.router.navigate(['/pages/auth/login']);
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
}
