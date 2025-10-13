import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { WorkerService, WorkerProfile } from '../../../services/worker.service';
import { DashboardService, ServiceCategory } from '../../../services/dashboard.service';
import { LocationService } from '../../../services/location.service';
import { LoadingController, ModalController, ToastController } from '@ionic/angular';

interface FilterOptions {
  searchTerm: string;
  selectedServices: string[];
  priceRange: { min: number; max: number };
  maxDistance: number;
  minRating: number;
  sortBy: 'distance' | 'rating' | 'price' | 'experience';
}

@Component({
  selector: 'app-browse-workers',
  templateUrl: './browse-workers.page.html',
  styleUrls: ['./browse-workers.page.scss'],
  standalone: false,
})
export class BrowseWorkersPage implements OnInit {
  userProfile: UserProfile | null = null;
  workers: WorkerProfile[] = [];
  filteredWorkers: WorkerProfile[] = [];
  serviceCategories: ServiceCategory[] = [];
  allServices: string[] = []; // Flat array of all services for easier filtering
  isLoading = false;
  selectedCategoryId: string | null = null;
  
  // Filter properties
  filters: FilterOptions = {
    searchTerm: '',
    selectedServices: [],
    priceRange: { min: 0, max: 5000 },
    maxDistance: 50,
    minRating: 0,
    sortBy: 'rating'
  };

  // UI state
  showFilters = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private workerService: WorkerService,
    private dashboardService: DashboardService,
    private locationService: LocationService,
    private loadingController: LoadingController,
    private modalController: ModalController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    // Get user profile
    this.authService.userProfile$.subscribe(profile => {
      this.userProfile = profile;
    });

    // Get selected category from route params
    this.route.queryParams.subscribe(params => {
      this.selectedCategoryId = params['category'] || null;
    });

    this.loadData();
  }

  async loadData() {
    this.isLoading = true;
    const loading = await this.loadingController.create({
      message: 'Loading workers...',
    });
    await loading.present();

    try {
      // Load service categories
      this.serviceCategories = await this.dashboardService.getServiceCategories();
      console.log('Loaded service categories:', this.serviceCategories);
      
      // Extract all services into a flat array
      this.allServices = [];
      this.serviceCategories.forEach((category: ServiceCategory) => {
        if (category.services) {
          this.allServices.push(...category.services);
        }
      });
      console.log('All available services:', this.allServices);
      
      // Load verified workers
      this.workers = await this.workerService.getVerifiedWorkers();
      console.log('Loaded workers:', this.workers.length);
      
      // Apply initial filtering
      this.applyFilters();
      
    } catch (error) {
      console.error('Error loading data:', error);
      this.showToast('Error loading workers. Please try again.', 'danger');
    } finally {
      this.isLoading = false;
      await loading.dismiss();
    }
  }

  applyFilters() {
    let filtered = [...this.workers];

    // Filter by search term (name or skills)
    if (this.filters.searchTerm) {
      const searchLower = this.filters.searchTerm.toLowerCase();
      filtered = filtered.filter(worker => 
        worker.fullName.toLowerCase().includes(searchLower) ||
        worker.skills?.some(skill => skill.toLowerCase().includes(searchLower))
      );
    }

    // Filter by selected services
    if (this.filters.selectedServices.length > 0) {
      filtered = filtered.filter(worker =>
        worker.skills?.some(skill => 
          this.filters.selectedServices.includes(skill)
        )
      );
    }

    // Filter by category if one was selected
    if (this.selectedCategoryId) {
      const selectedCategory = this.serviceCategories.find(cat => cat.id === this.selectedCategoryId);
      if (selectedCategory) {
        filtered = filtered.filter(worker =>
          worker.skills?.some(skill => 
            selectedCategory.services.includes(skill)
          )
        );
      }
    }

    // Filter by rating
    if (this.filters.minRating > 0) {
      filtered = filtered.filter(worker => (worker.rating || 0) >= this.filters.minRating);
    }

    // Sort workers
    filtered.sort((a, b) => {
      switch (this.filters.sortBy) {
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'experience':
          return (b.jobsCompleted || 0) - (a.jobsCompleted || 0);
        default:
          return 0;
      }
    });

    this.filteredWorkers = filtered;
  }

  onSearchChange(event: any) {
    this.filters.searchTerm = event.detail.value;
    this.applyFilters();
  }

  toggleFilter() {
    this.showFilters = !this.showFilters;
  }

  toggleService(service: string) {
    const index = this.filters.selectedServices.indexOf(service);
    if (index > -1) {
      this.filters.selectedServices.splice(index, 1);
    } else {
      this.filters.selectedServices.push(service);
    }
    this.applyFilters();
  }

  isServiceSelected(service: string): boolean {
    return this.filters.selectedServices.includes(service);
  }

  onRatingChange(event: any) {
    this.filters.minRating = event.detail.value;
    this.applyFilters();
  }

  onSortChange(event: any) {
    this.filters.sortBy = event.detail.value;
    this.applyFilters();
  }

  async viewWorkerDetails(worker: WorkerProfile) {
    // Navigate to worker detail page or open modal
    this.router.navigate(['/client/worker-detail'], {
      queryParams: { workerId: worker.uid }
    });
  }

  async scheduleBooking(worker: WorkerProfile) {
    // Navigate to booking calendar
    this.router.navigate(['/client/schedule-booking'], {
      queryParams: { workerId: worker.uid }
    });
  }

  goBack() {
    this.router.navigate(['/pages/client/dashboard']);
  }

  getWorkerSkillsDisplay(skills: string[]): string {
    if (!skills || skills.length === 0) return 'No skills listed';
    if (skills.length <= 2) return skills.join(', ');
    return `${skills.slice(0, 2).join(', ')} +${skills.length - 2} more`;
  }

  getStarArray(rating: number): boolean[] {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(i <= rating);
    }
    return stars;
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
}