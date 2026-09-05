import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Hold, PortalApiService, STATUS_LABELS, money } from '../core/portal-api.service';
import { GridSort } from '../shared/grid-sort';
import { StandardGridComponent, StdGridColumn } from '../shared/standard-grid.component';
import { HoldSlideoutComponent } from './hold-slideout.component';
import { GRID_PAGE_STYLES } from './grid-page-styles';

type HoldSort = 'created' | 'from' | 'reference' | 'status' | 'total' | 'holdUntil' | 'guest';

/** Holds (Dave, 2026-09-05): every hold the operator has taken, in the Standard Grid; click a row for the detail, the cancel and "Make the booking". */
@Component({
  selector: 'sto-holds',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, StandardGridComponent, HoldSlideoutComponent],
  template: `
    <section class="gp-page">
      <header class="gp-head">
        <div><h1>Holds</h1><p class="gp-dim">Nights held for you on the lodge's diary until the clock runs out. A hold becomes a booking from its detail.</p></div>
        <a class="oa-btn oa-btn-primary" routerLink="/new">+ New hold</a>
      </header>
      <div class="gp-bar">
        <select class="oa-input gp-filter" name="status" [ngModel]="status()" (ngModelChange)="onStatus($event)">
          <option value="">Every status</option><option value="active">Open</option><option value="converted">Became bookings</option><option value="cancelled">Cancelled</option><option value="expired">Ran out</option>
        </select>
      </div>
      <oa-standard-grid [columns]="columns" template="1fr 1.6fr 1.8fr 1.4fr 1fr 0.9fr 1.2fr 1.1fr" [rows]="rows()" [trackBy]="trackId" [total]="total()" [page]="pageNo()" [pageSize]="pageSize()" [sortKey]="sort.field()" [sortDir]="sort.dir()" [loading]="loading()" noun="holds" searchPlaceholder="Search reference, guest or suite…" emptyText="No holds yet." (searchChange)="onSearch($event)" (sortChange)="onSort($event)" (pageChange)="gotoPage($event)" (pageSizeChange)="setPageSize($event)" (rowClick)="open($event)">
        <ng-template let-r>
          <span class="gp-ref">{{ r.reference }}</span>
          <span>{{ r.from | date: 'd MMM' }} → {{ r.to | date: 'd MMM yyyy' }} <span class="gp-dim">· {{ r.nights }}n</span></span>
          <span class="gp-ell" [title]="suites(r)">{{ suites(r) }}</span>
          <span class="gp-ell">{{ guest(r) }}</span>
          <span class="gp-num">{{ money(r.total, r.currency) }}</span>
          <span><span class="gp-pill" [class.ok]="r.active" [class.bad]="r.status === 'cancelled' || r.status === 'expired'" [class.busy]="r.status === 'converted'">{{ r.active ? 'Held' : label(r.status) }}</span></span>
          <span class="gp-dim">@if (r.active) { runs out {{ r.holdUntil | date: 'd MMM, HH:mm' }} } @else { — }</span>
          <span class="gp-dim">{{ r.createdAt | date: 'd MMM, HH:mm' }}</span>
        </ng-template>
      </oa-standard-grid>
    </section>
    @if (selected(); as id) { <sto-hold-slideout [id]="id" (closed)="selected.set(null)" (changed)="load()" /> }
  `,
  styles: [GRID_PAGE_STYLES],
})
export class HoldsComponent implements OnInit {
  private readonly api = inject(PortalApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly columns: StdGridColumn[] = [
    { key: 'reference', label: 'Reference' }, { key: 'from', label: 'Stay' }, { key: 'suites', label: 'Suites', sortable: false }, { key: 'guest', label: 'Guest' },
    { key: 'total', label: 'Total' }, { key: 'status', label: 'Status' }, { key: 'holdUntil', label: 'Runs out' }, { key: 'created', label: 'Taken' },
  ];
  readonly trackId = (r: Hold) => r.id;
  readonly rows = signal<Hold[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly offset = signal(0);
  readonly pageSize = signal(50);
  readonly search = signal('');
  readonly status = signal('');
  readonly sort = new GridSort<HoldSort>('created', 'desc', { descFirst: ['created', 'from', 'total', 'holdUntil'], onChange: () => { this.offset.set(0); this.load(); } });
  readonly pageNo = computed(() => Math.floor(this.offset() / this.pageSize()) + 1);
  readonly selected = signal<string | null>(null);

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('status')) this.status.set(qp.get('status') ?? '');
    if (qp.get('q')) this.search.set(qp.get('q') ?? '');
    this.load();
    if (qp.get('open')) this.selected.set(qp.get('open'));
    this.route.queryParamMap.subscribe((m) => { const o = m.get('open'); if (o && o !== this.selected()) this.selected.set(o); });
  }
  money(v: number | null, c?: string | null): string { return money(v, c ?? 'ZAR'); }
  label(s: string): string { return STATUS_LABELS[s] ?? s; }
  suites(r: Hold): string { return r.suites.map((x) => `${x.name}${x.units > 1 ? ' × ' + x.units : ''}`).join(', '); }
  guest(r: Hold): string { return r.guest ? `${r.guest.firstName} ${r.guest.lastName}`.trim() || '—' : '—'; }
  load(): void {
    this.loading.set(true);
    this.api.holds({ page: this.pageNo(), pageSize: this.pageSize(), sort: this.sort.field(), dir: this.sort.dir(), q: this.search() || undefined, status: this.status() || undefined }).subscribe({
      next: (r) => { this.rows.set(r.rows); this.total.set(r.total); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
  onSearch(q: string): void { this.search.set(q); this.offset.set(0); this.load(); }
  onStatus(v: string): void { this.status.set(v); this.offset.set(0); this.load(); }
  onSort(key: string): void { this.sort.by(key as HoldSort); }
  gotoPage(p: number): void { this.offset.set((p - 1) * this.pageSize()); this.load(); }
  setPageSize(n: number): void { this.pageSize.set(n); this.offset.set(0); this.load(); }
  open(r: Hold): void { this.selected.set(r.id); void this.router.navigate([], { queryParams: { open: r.id }, queryParamsHandling: 'merge' }); }
}

