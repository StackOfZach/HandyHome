import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-worker-lookup',
  templateUrl: './worker-lookup.page.html',
  styleUrls: ['./worker-lookup.page.scss'],
  standalone: false,
})
export class WorkerLookupPage implements OnInit {
  bookingId: string = '';
  selectedService: string = '';
  selectedDate: string = '';
  currentMessageIndex = 0;
  currentFactIndex = 0;
  progressWidth = 0;

  searchMessages = [
    'Looking for HandyHome Workers...',
    'Searching available workers in your area...',
    'Finding the perfect match for your service...',
    'Analyzing worker schedules and availability...',
    'Almost ready with your results!',
  ];

  funFacts = [
    'Our workers are background-checked and verified for your safety.',
    'Average response time from workers is under 30 minutes.',
    'HandyHome has helped complete over 10,000 successful bookings.',
    'Workers are rated by clients to ensure quality service.',
    'We match you with workers based on location, skills, and availability.',
  ];

  constructor(private router: Router, private route: ActivatedRoute) {}

  ngOnInit() {
    // Get query parameters
    this.route.queryParams.subscribe((params) => {
      this.bookingId = params['bookingId'] || '';
      this.selectedService = params['service'] || '';
      this.selectedDate = params['date'] || '';
    });

    // Start animations
    this.startProgressAnimation();
    this.startMessageAnimation();
    this.startFactAnimation();

    // Auto-redirect to worker results after 3 seconds
    setTimeout(() => {
      this.router.navigate(['/client/worker-results'], {
        queryParams: {
          bookingId: this.bookingId,
          service: this.selectedService,
          date: this.selectedDate,
        },
      });
    }, 3000);
  }

  goBack() {
    this.router.navigate(['/client/book-service']);
  }

  startProgressAnimation() {
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 15 + 5; // Random increment between 5-20
      this.progressWidth = Math.floor(Math.min(progress, 95)); // Cap at 95% until completion, use integer only

      if (progress >= 95) {
        clearInterval(progressInterval);
        // Complete to 100% right before navigation
        setTimeout(() => {
          this.progressWidth = 100;
        }, 2500);
      }
    }, 300);
  }

  startMessageAnimation() {
    const messageInterval = setInterval(() => {
      this.currentMessageIndex =
        (this.currentMessageIndex + 1) % this.searchMessages.length;
    }, 600);

    // Clear interval after 3 seconds
    setTimeout(() => {
      clearInterval(messageInterval);
    }, 3000);
  }

  startFactAnimation() {
    const factInterval = setInterval(() => {
      this.currentFactIndex =
        (this.currentFactIndex + 1) % this.funFacts.length;
    }, 1200);

    // Clear interval after 3 seconds
    setTimeout(() => {
      clearInterval(factInterval);
    }, 3000);
  }
}
