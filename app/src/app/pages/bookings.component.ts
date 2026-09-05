import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Booking, PortalApiService, STATUS_LABELS, money } from '../core/portal-api.service';
import { GridSort } from '../shared/grid-sort';
import { StandardGridComponent, StdGridColumn } from '../shared/standard-grid.component';
import { BookingSlideoutComponent } from './booking-slideout.component';
import { GRID_PAGE_STYLES } from './grid-page-styles';

type BookingSort = 'created' | 'from' | 'reference' | 'status' | 'total' | 'guest';

/** Bookings (Dave, 2026-09-05): every booking the operator has made, in the Standard Grid; click a row for the detail and the cancel. */
@Component({
  selector: 'sto-bookings',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, StandardGridComponent, BookingSlideoutComponent],
  template: `
    <section class="gp-page">
      <header class="gp-head">
        <div><h1>Bookings</h1><p class="gp-dim">Your bookings on the lodge's diary. A new booking is provisional until the lodge confirms it.</p></div>
        <a class="oa-btn oa-btn-primary" routerLink="/new">+ New booking</a>
      </header>
      <div class="gp-bar">
        <select class="oa-input gp-filter" name="status" [ngModel]="status()" (ngModelChange)="onStatus($event)">
          <option value="">Every status</option><option value="live">Live</option><option value="provisional">Provisional</option><option value="confirmed">Confirmed</option><option value="checked_in">Checked in</option><option value="checked_out">Checked out</option><option value="cancelled">Cancelled</option>
        </select>
      </div>
      <oa-standard-grid [columns]="columns" template="1fr 1.6fr 1.8fr 1.4fr 1fr 1fr 1.1fr" [rows]="rows()" [trackBy]="trackId" [total]="total()" [page]="pageNo()" [pageSize]="pageSize()" [sortKey]="sort.field()" [sortDir]="sort.dir()" [loading]="loading()" noun="bookings" searchPlaceholder="Search reference, guest or suite…" emptyText="No bookings yet." (searchChange)="onSearch($event)" (sortChange)="onSort($event)" (pageChange)="gotoPage($event)" (pageSizeChange)="setPageSize($event)" (rowClick)="open($event)">
        <ng-template let-r>
          <span class="gp-ref">{{ r.reference }}</span>
          <span>{{ r.from | date: 'd MMM' }} → {{ r.to | date: 'd MMM yyyy' }} <span class="gp-dim">· {{ r.nights }}n</span></span>
          <span class="gp-ell" [title]="suites(r)">{{ suites(r) }}</span>
          <span class="gp-ell">{{ guest(r) }}</span>
          <span class="gp-num">{{ money(r.total, r.currency) }}</span>
          <span><span class="gp-pill" [class.ok]="r.status === 'confirmed' || r.status === 'checked_in'" [class.bad]="r.status === 'cancelled' || r.status === 'no_show'" [class.busy]="r.status === 'provisional'">{{ label(r.status) }}</span></span>
          <span class="gp-dim">{{ r.createdAt | date: 'd MMM, HH:mm' }}</span>
        </ng-template>
      </oa-standard-grid>
    </section>
    @if (selected(); as id) { <sto-booking-slideout [id]="id" (closed)="selected.set(null)" (changed)="load()" /> }
  `,
  styles: [GRID_PAGE_STYLES],
})
export class BookingsComponent implements OnInit {
  private readonly api = inject(PortalApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly columns: StdGridColumn[] = [
    { key: 'reference', label: 'Reference' }, { key: 'from', label: 'Stay' }, { key: 'suites', label: 'Suites', sortable: false }, { key: 'guest', label: 'Guest' },
    { key: 'total', label: 'Total' }, { key: 'status', label: 'Status' }, { key: 'created', label: 'Made' },
  ];
  readonly trackId = (r: Booking) => r.id;
  readonly rows = signal<Booking[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly offset = signal(0);
  readonly pageSize = signal(50);
  readonly search = signal('');
  readonly status = signal('');
  readonly sort = new GridSort<BookingSort>('created', 'desc', { descFirst: ['created', 'from', 'total'], onChange: () => { this.offset.set(0); this.load(); } });
  readonly pageNo = computed(() => Math.floor(this.offset() / this.pageSize()) + 1);
  readonly selected = signal<string | null>(null);

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('status')) this.status.set(qp.get('status') ?? '');
    if (qp.get('q')) this.search.set(qp.get('q') ?? '');
    this.load();
    if (qp.get('open')) this.selected.set(qp.get('open'));
    this.route.queryParamMap.subscribe((m) => {
      const o = m.get('open'); if (o && o !== this.selected()) this.selected.set(o);
      const q = m.get('q') ?? ''; if (q !== this.search()) { this.search.set(q); this.offset.set(0); this.load(); }
    });
  }
  money(v: number | null, c?: string | null): string { return money(v, c ?? 'ZAR'); }
  label(s: string): string { return STATUS_LABELS[s] ?? s; }
  suites(r: Booking): string { return r.suites.map((x) => `${x.name}${x.units > 1 ? ' × ' + x.units : ''}`).join(', '); }
  guest(r: Booking): string { return r.guest ? `${r.guest.firstName} ${r.guest.lastName}`.trim() || '—' : '—'; }
  load(): void {
    this.loading.set(true);
    this.api.bookings({ page: this.pageNo(), pageSize: this.pageSize(), sort: this.sort.field(), dir: this.sort.dir(), q: this.search() || undefined, status: this.status() || undefined }).subscribe({
      next: (r) => { this.rows.set(r.rows); this.total.set(r.total); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
  onSearch(q: string): void { this.search.set(q); this.offset.set(0); this.load(); }
  onStatus(v: string): void { this.status.set(v); this.offset.set(0); this.load(); }
  onSort(key: string): void { this.sort.by(key as BookingSort); }
  gotoPage(p: number): void { this.offset.set((p - 1) * this.pageSize()); this.load(); }
  setPageSize(n: number): void { this.pageSize.set(n); this.offset.set(0); this.load(); }
  open(r: Booking): void { this.selected.set(r.id); void this.router.navigate([], { queryParams: { open: r.id }, queryParamsHandling: 'merge' }); }
}
