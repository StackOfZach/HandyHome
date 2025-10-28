import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: '/pages/auth/login',
    pathMatch: 'full',
  },
  {
    path: 'home',
    loadChildren: () =>
      import('./home/home.module').then((m) => m.HomePageModule),
  },
  // Authentication Routes
  {
    path: 'pages/auth/login',
    loadChildren: () =>
      import('./pages/auth/login/login.module').then((m) => m.LoginPageModule),
  },
  {
    path: 'pages/auth/signup',
    loadChildren: () =>
      import('./pages/auth/signup/signup.module').then(
        (m) => m.SignupPageModule
      ),
  },
  {
    path: 'pages/auth/forgot-password',
    loadChildren: () =>
      import('./pages/auth/forgot-password/forgot-password.module').then(
        (m) => m.ForgotPasswordPageModule
      ),
  },
  {
    path: 'pages/auth/client-verification',
    loadChildren: () =>
      import(
        './pages/auth/client-verification/client-verification.module'
      ).then((m) => m.ClientVerificationPageModule),
  },
  // Client Dashboard - Protected Route
  {
    path: 'pages/client/dashboard',
    loadChildren: () =>
      import('./pages/client/dashboard/dashboard.module').then(
        (m) => m.ClientDashboardPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // Worker Interview - Protected Route
  {
    path: 'pages/worker/interview',
    loadChildren: () =>
      import('./pages/worker/interview/interview.module').then(
        (m) => m.InterviewPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'worker' },
  },
  // Worker Dashboard - Protected Route
  {
    path: 'pages/worker/dashboard',
    loadChildren: () =>
      import('./pages/worker/dashboard/dashboard.module').then(
        (m) => m.WorkerDashboardPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'worker' },
  },
  // Worker Update Profile - Protected Route
  {
    path: 'pages/worker/update-profile',
    loadChildren: () =>
      import('./pages/worker/update-profile/update-profile.module').then(
        (m) => m.UpdateProfilePageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'worker' },
  },
  // Worker Job Listings - Protected Route
  {
    path: 'pages/worker/job-listings',
    loadChildren: () =>
      import('./pages/worker/job-listings/job-listings.module').then(
        (m) => m.JobListingsPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'worker' },
  },
  // Worker Booking Requests - Protected Route
  {
    path: 'worker-booking-requests',
    loadChildren: () =>
      import(
        './pages/worker-booking-requests/worker-booking-requests.module'
      ).then((m) => m.WorkerBookingRequestsPageModule),
    canActivate: [AuthGuard],
    data: { role: 'worker' },
  },
  // Worker Job History - Protected Route
  {
    path: 'pages/worker/job-history',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/worker/job-history/job-history.module').then(
        (m) => m.JobHistoryPageModule
      ),
    data: { role: 'worker' },
  },
  {
    path: 'pages/worker/booking-details',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/worker/booking-details/booking-details.module').then(
        (m) => m.BookingDetailsPageModule
      ),
    data: { role: 'worker' },
  },
  {
    path: 'pages/worker/booking-details/:id',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/worker/booking-details/booking-details.module').then(
        (m) => m.BookingDetailsPageModule
      ),
    data: { role: 'worker' },
  },
  // Worker Active Bookings - Protected Route
  {
    path: 'pages/worker/active-bookings',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/worker/active-bookings/active-bookings.module').then(
        (m) => m.ActiveBookingsPageModule
      ),
    data: { role: 'worker' },
  },
  // Admin Dashboard - Protected Route
  {
    path: 'pages/admin/dashboard',
    loadChildren: () =>
      import('./pages/admin/dashboard/dashboard.module').then(
        (m) => m.AdminDashboardPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'admin' },
  },
  // Book Service - Protected Route
  {
    path: 'pages/book-service',
    loadChildren: () =>
      import('./pages/book-service/book-service.module').then(
        (m) => m.BookServicePageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // My Bookings - Protected Route
  {
    path: 'pages/my-bookings',
    loadChildren: () =>
      import('./pages/my-bookings/my-bookings.module').then(
        (m) => m.MyBookingsPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // Quick Booking Flow - Protected Routes
  {
    path: 'client/select-category',
    loadChildren: () =>
      import('./pages/client/select-category/select-category.module').then(
        (m) => m.SelectCategoryPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'client/select-location/:categoryId',
    loadChildren: () =>
      import('./pages/client/select-location/select-location.module').then(
        (m) => m.SelectLocationPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'client/confirm-booking',
    loadChildren: () =>
      import('./pages/client/confirm-booking/confirm-booking.module').then(
        (m) => m.ConfirmBookingPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'client/searching/:bookingId',
    loadChildren: () =>
      import('./pages/client/searching/searching.module').then(
        (m) => m.SearchingPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'client/worker-found/:bookingId',
    loadChildren: () =>
      import('./pages/client/worker-found/worker-found.module').then(
        (m) => m.WorkerFoundPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'client/worker-found',
    loadChildren: () =>
      import('./pages/client/worker-found/worker-found.module').then(
        (m) => m.WorkerFoundPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // Browse Workers - Protected Route
  {
    path: 'client/browse-workers',
    loadChildren: () =>
      import('./pages/client/browse-workers/browse-workers.module').then(
        (m) => m.BrowseWorkersPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // Worker Detail - Protected Route
  {
    path: 'client/worker-detail',
    loadChildren: () =>
      import('./pages/client/worker-detail/worker-detail.module').then(
        (m) => m.WorkerDetailPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // Schedule Booking - Protected Route
  {
    path: 'client/schedule-booking',
    loadChildren: () =>
      import('./pages/client/schedule-booking/schedule-booking.module').then(
        (m) => m.ScheduleBookingPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // Client Booking Details - Protected Route
  {
    path: 'pages/client/booking-details/:id',
    loadChildren: () =>
      import('./pages/client/booking-details/booking-details.module').then(
        (m) => m.BookingDetailsPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // New Modern Booking Flow - Protected Routes
  {
    path: 'client/book-service',
    loadChildren: () =>
      import('./pages/client/book-service/book-service.module').then(
        (m) => m.BookServicePageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'client/worker-lookup',
    loadChildren: () =>
      import('./pages/client/worker-lookup/worker-lookup.module').then(
        (m) => m.WorkerLookupPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'client/worker-results',
    loadChildren: () =>
      import('./pages/client/worker-results/worker-results.module').then(
        (m) => m.WorkerResultsPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'client/booking-progress/:bookingId',
    loadChildren: () =>
      import('./pages/client/booking-progress/booking-progress.module').then(
        (m) => m.BookingProgressPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'client/booking-history',
    loadChildren: () =>
      import('./pages/client/booking-history/booking-history.module').then(
        (m) => m.BookingHistoryPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // Profile - Protected Route
  {
    path: 'pages/profile',
    loadChildren: () =>
      import('./pages/profile/profile.module').then((m) => m.ProfilePageModule),
    canActivate: [AuthGuard],
  },
  // Quick Bookings History - Protected Route
  {
    path: 'pages/quick-bookings-history',
    loadChildren: () =>
      import(
        './pages/quick-bookings-history/quick-bookings-history.module'
      ).then((m) => m.QuickBookingsHistoryPageModule),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  // Quick Booking Details - Protected Route
  {
    path: 'pages/quick-booking-details/:id',
    loadChildren: () =>
      import('./pages/quick-booking-details/quick-booking-details.module').then(
        (m) => m.QuickBookingDetailsPageModule
      ),
    canActivate: [AuthGuard],
    data: { role: 'client' },
  },
  {
    path: 'pages/worker/job-request-details/:id',
    loadChildren: () =>
      import(
        './pages/worker/job-request-details/job-request-details.module'
      ).then((m) => m.JobRequestDetailsPageModule),
    canActivate: [AuthGuard],
    data: { role: 'worker' },
  },
  {
    path: 'pages/worker/worker-booking-details',
    loadChildren: () =>
      import(
        './pages/worker/worker-booking-details/worker-booking-details.module'
      ).then((m) => m.WorkerBookingDetailsPageModule),
    canActivate: [AuthGuard],
    data: { role: 'worker' },
  },
  {
    path: 'pages/worker/quick-booking-history',
    loadChildren: () =>
      import(
        './pages/worker/quick-booking-history/quick-booking-history.module'
      ).then((m) => m.QuickBookingHistoryPageModule),
    canActivate: [AuthGuard],
    data: { role: 'worker' },
  },
  // Wildcard route - redirect to login (MUST BE LAST)
  {
    path: '**',
    redirectTo: '/pages/auth/login',
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
