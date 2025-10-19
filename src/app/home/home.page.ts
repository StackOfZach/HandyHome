import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  constructor(private authService: AuthService, private router: Router) {}

  async ngOnInit() {
    // Handle startup navigation logic
    await this.handleStartupNavigation();
  }

  private async handleStartupNavigation(): Promise<void> {
    try {
      // Wait for auth to be initialized
      await this.authService.waitForAuthInitialization();

      console.log('Home page: handling startup navigation');

      // Check if user should be automatically logged in
      if (this.authService.shouldAutoLogin()) {
        console.log(
          'Home page: valid session found, navigating to appropriate page'
        );
        // Navigate to appropriate start page based on stored session
        await this.authService.navigateToAppropriateStartPage();
      } else {
        console.log('Home page: no valid session, going to login');
        // No valid session, go to login
        this.router.navigate(['/pages/auth/login']);
      }
    } catch (error) {
      console.error('Error handling startup navigation:', error);
      // Fallback to login page
      this.router.navigate(['/pages/auth/login']);
    }
  }
}
