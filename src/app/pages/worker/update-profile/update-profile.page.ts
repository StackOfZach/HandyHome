import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { WorkerService, WorkerProfile } from '../../../services/worker.service';
import {
  DashboardService,
  ServiceCategory,
} from '../../../services/dashboard.service';
import {
  ToastController,
  LoadingController,
  AlertController,
} from '@ionic/angular';

interface SubServicePrice {
  subServiceName: string;
  price: number;
}

interface ServiceWithPricing {
  categoryName: string;
  subServices: SubServicePrice[];
}

@Component({
  selector: 'app-update-profile',
  templateUrl: './update-profile.page.html',
  styleUrls: ['./update-profile.page.scss'],
  standalone: false,
})
export class UpdateProfilePage implements OnInit {
  profileForm: FormGroup;
  userProfile: UserProfile | null = null;
  workerProfile: WorkerProfile | null = null;
  serviceCategories: ServiceCategory[] = [];
  selectedPhoto: string | null = null;
  isLoading = false;

  constructor(
    private router: Router,
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private workerService: WorkerService,
    private dashboardService: DashboardService,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController
  ) {
    this.profileForm = this.createProfileForm();
  }

  ngOnInit() {
    this.loadUserData();
    this.loadServiceCategories();
  }

  createProfileForm(): FormGroup {
    return this.formBuilder.group({
      fullName: ['', [Validators.required]],
      phone: ['', [Validators.required]],
      fullAddress: [''],
      workRadius: [5, [Validators.min(1), Validators.max(50)]],
      availableDays: this.formBuilder.array([]),
      emergencyContact: [''],
      emergencyPhone: [''],
      bio: [''],
      skills: this.formBuilder.array([]),
      serviceWithPricing: this.formBuilder.array([]),
    });
  }

  async loadUserData() {
    this.authService.userProfile$.subscribe(async (profile) => {
      if (profile) {
        this.userProfile = profile;
        this.workerProfile = await this.workerService.getWorkerProfile(
          profile.uid
        );
        this.populateForm();
      }
    });
  }

  async loadServiceCategories() {
    try {
      this.serviceCategories =
        await this.dashboardService.getServiceCategories();
    } catch (error) {
      console.error('Error loading service categories:', error);
    }
  }

  populateForm() {
    if (!this.workerProfile || !this.userProfile) return;

    this.profileForm.patchValue({
      fullName: this.userProfile.fullName || '',
      phone: this.userProfile.phone || '',
      fullAddress: this.workerProfile.fullAddress || '',
      workRadius: this.workerProfile.workRadius || 5,
      emergencyContact: this.workerProfile.emergencyContact || '',
      emergencyPhone: this.workerProfile.emergencyPhone || '',
      bio: (this.workerProfile as any).bio || '',
    });

    // Populate skills
    if (this.workerProfile.skills) {
      const skillsArray = this.profileForm.get('skills') as FormArray;
      skillsArray.clear();
      this.workerProfile.skills.forEach((skill) => {
        skillsArray.push(this.formBuilder.control(skill));
      });
    }

    // Populate service prices
    const serviceWithPricingArray = this.profileForm.get(
      'serviceWithPricing'
    ) as FormArray;
    serviceWithPricingArray.clear();
    if ((this.workerProfile as any).serviceWithPricing) {
      (this.workerProfile as any).serviceWithPricing.forEach(
        (svc: ServiceWithPricing) => {
          const subServicesControls: any[] = [];
          svc.subServices.forEach((s: SubServicePrice) => {
            subServicesControls.push(
              this.formBuilder.group({
                subServiceName: [s.subServiceName, Validators.required],
                price: [s.price || 0, [Validators.required, Validators.min(0)]],
              })
            );
          });

          serviceWithPricingArray.push(
            this.formBuilder.group({
              categoryName: [svc.categoryName, Validators.required],
              subServices: this.formBuilder.array(subServicesControls),
            })
          );
        }
      );
    }

    // Populate available days
    const daysArray = this.profileForm.get('availableDays') as FormArray;
    daysArray.clear();
    const allDays = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    allDays.forEach((day) => {
      const isSelected =
        this.workerProfile?.availableDays?.includes(day) || false;
      daysArray.push(this.formBuilder.control(isSelected));
    });

    if (this.workerProfile.profilePhotoData) {
      this.selectedPhoto = this.workerProfile.profilePhotoData;
    }
  }

  get skillsArray(): FormArray {
    return this.profileForm.get('skills') as FormArray;
  }

  get serviceWithPricingArray(): FormArray {
    return this.profileForm.get('serviceWithPricing') as FormArray;
  }

  get availableDaysArray(): FormArray {
    return this.profileForm.get('availableDays') as FormArray;
  }

  addSkill() {
    if (this.skillsArray.length < 3) {
      this.skillsArray.push(this.formBuilder.control('', Validators.required));
    }
  }

  removeSkill(index: number) {
    this.skillsArray.removeAt(index);
  }

  addServiceWithPricing() {
    this.serviceWithPricingArray.push(
      this.formBuilder.group({
        categoryName: ['', Validators.required],
        subServices: this.formBuilder.array([]),
      })
    );
  }

  removeServiceWithPricing(index: number) {
    this.serviceWithPricingArray.removeAt(index);
  }

  // When a category is selected, populate its sub-services into the form
  onCategorySelected(index: number, categoryName: string) {
    const grp = this.serviceWithPricingArray.at(index) as FormGroup;
    grp.patchValue({ categoryName });

    // Clear existing sub-services and create new ones
    const subServicesControls: any[] = [];
    const category = this.serviceCategories.find(
      (c) => c.name === categoryName
    );
    if (category && category.services && category.services.length) {
      category.services.forEach((sub) => {
        subServicesControls.push(
          this.formBuilder.group({
            subServiceName: [sub, Validators.required],
            price: [0, [Validators.required, Validators.min(0)]],
          })
        );
      });
    }

    // Replace the entire subServices FormArray
    grp.setControl('subServices', this.formBuilder.array(subServicesControls));
  }

  removeSubService(catIndex: number, subIndex: number) {
    const grp = this.serviceWithPricingArray.at(catIndex) as FormGroup;
    const subServicesFA = grp.get('subServices') as FormArray;
    subServicesFA.removeAt(subIndex);
  }

  // Helper method to get sub-services FormArray
  getSubServicesArray(svcCtrl: any): FormArray {
    return svcCtrl.get('subServices') as FormArray;
  }

  onPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        this.selectedPhoto = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  getDayName(index: number): string {
    const days = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    return days[index];
  }

  getAvailableSkills(): string[] {
    const skillsArray = this.profileForm.get('skills') as FormArray;
    return skillsArray.controls
      .map((control) => control.value)
      .filter((skill: string) => skill && skill.trim() !== '');
  }

  hasAvailableSkills(): boolean {
    return this.getAvailableSkills().length > 0;
  }

  async saveProfile() {
    if (this.profileForm.valid && this.userProfile) {
      const loading = await this.loadingController.create({
        message: 'Updating profile...',
      });
      await loading.present();

      try {
        const formValue = this.profileForm.value;

        // Process available days
        const selectedDays: string[] = [];
        const allDays = [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ];
        formValue.availableDays.forEach(
          (isSelected: boolean, index: number) => {
            if (isSelected) {
              selectedDays.push(allDays[index]);
            }
          }
        );

        // Prepare worker profile data
        const workerData: Partial<WorkerProfile & any> = {
          fullAddress: formValue.fullAddress,
          workRadius: formValue.workRadius,
          skills: formValue.skills.filter(
            (skill: string) => skill.trim() !== ''
          ),
          availableDays: selectedDays,
          emergencyContact: formValue.emergencyContact,
          emergencyPhone: formValue.emergencyPhone,
          bio: formValue.bio,
          // Convert serviceWithPricing form to storage format
          serviceWithPricing: (formValue.serviceWithPricing || [])
            .map((svc: any) => ({
              categoryName: svc.categoryName,
              subServices: (svc.subServices || [])
                .filter((s: any) => s.subServiceName && s.price >= 0)
                .map((s: any) => ({
                  subServiceName: s.subServiceName,
                  price: s.price,
                })),
            }))
            .filter((svc: any) => svc.subServices.length > 0),
          updatedAt: new Date(),
        };

        if (this.selectedPhoto) {
          workerData['profilePhotoData'] = this.selectedPhoto;
        }

        // Update user profile
        await this.authService.updateUserProfile({
          fullName: formValue.fullName,
          phone: formValue.phone,
        });

        // Update worker profile
        await this.workerService.updateWorkerProfile(
          this.userProfile.uid,
          workerData
        );

        await loading.dismiss();
        await this.showToast('Profile updated successfully!', 'success');
        this.router.navigate(['/pages/worker/dashboard']);
      } catch (error) {
        await loading.dismiss();
        console.error('Error updating profile:', error);
        await this.showToast(
          'Error updating profile. Please try again.',
          'danger'
        );
      }
    } else {
      await this.showToast(
        'Please fill in all required fields correctly.',
        'warning'
      );
    }
  }

  async showToast(message: string, color: 'success' | 'danger' | 'warning') {
    const toast = await this.toastController.create({
      message,
      color,
      duration: 3000,
      position: 'top',
    });
    await toast.present();
  }

  goBack() {
    this.router.navigate(['/pages/worker/dashboard']);
  }
}
