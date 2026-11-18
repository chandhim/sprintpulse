/*
 * SprintPulse demo data: a 2-week sprint (day 7 of 14) that produces an AMBER result.
 * Dates are relative to "now", so the demo always looks current.
 */
(function (root) {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;

  function build(now) {
    const nowMs = now ? new Date(now).getTime() : Date.now();
    const iso = function (daysAgo) { return new Date(nowMs - daysAgo * DAY_MS).toISOString(); };
    const start = new Date(nowMs - 6 * DAY_MS);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 14 * DAY_MS);
    end.setHours(17, 0, 0, 0);

    // [key, title, status, assignee, createdDaysAgo, updatedDaysAgo, dueInDays (negative = past) or null]
    const rows = [
      ['POS-101', 'Login with mobile number and OTP', 'done', 'Nimal Perera', 12, 4, null],
      ['POS-102', 'Product search by barcode', 'done', 'Kasuni Silva', 12, 3, null],
      ['POS-103', 'Add item to cart', 'done', 'Tharindu Fernando', 12, 5, null],
      ['POS-104', 'Apply discount codes', 'done', 'Kasuni Silva', 11, 2, null],
      ['POS-105', 'Print customer receipt', 'done', 'Dilani Jayasinghe', 11, 1, null],
      ['POS-106', 'Daily sales summary screen', 'done', 'Ravindu Gunawardena', 10, 2, null],
      ['POS-107', 'Cashier shift open and close', 'done', 'Nimal Perera', 10, 1, null],
      ['POS-108', 'Low-stock alert list', 'done', 'Tharindu Fernando', 9, 0, null],
      ['POS-109', 'Card payment integration', 'blocked', 'Ravindu Gunawardena', 12, 1, 3],
      ['POS-110', 'Loyalty points calculation', 'blocked', 'Dilani Jayasinghe', 10, 1, 5],
      ['POS-111', 'Refund and return flow', 'done', 'Kasuni Silva', 10, 0, null],
      ['POS-112', 'Supplier purchase order form', 'inprogress', 'Nimal Perera', 9, 1, 6],
      ['POS-113', 'Sinhala and Tamil receipt text', 'inprogress', 'Tharindu Fernando', 9, 4, -1],
      ['POS-114', 'Offline mode for billing', 'inprogress', null, 8, 2, 7],
      ['POS-115', 'Role-based access for managers', 'inprogress', 'Dilani Jayasinghe', 8, 0, 6],
      ['POS-116', 'Export sales to Excel', 'todo', 'Ravindu Gunawardena', 8, 5, 8],
      ['POS-117', 'Customer feedback screen', 'todo', null, 8, 6, 8],
      ['POS-118', 'Price change audit log', 'todo', 'Kasuni Silva', 7, 3, 7],
      ['POS-119', 'End-of-day cash report', 'todo', 'Nimal Perera', 7, 2, 7],
      ['POS-120', 'VAT invoice format update', 'todo', 'Tharindu Fernando', 2, 2, 7]
    ];

    const items = rows.map(function (r) {
      return {
        key: r[0],
        title: r[1],
        url: '',
        status: r[2],
        assignee: r[3],
        created: iso(r[4]),
        updated: iso(r[5]),
        due: r[6] === null ? null : new Date(nowMs + r[6] * DAY_MS).toISOString()
      };
    });

    return {
      board: { name: 'Supermarket POS (demo)', source: 'demo', id: 'demo' },
      sprint: { name: 'Sprint 7', start: start.toISOString(), end: end.toISOString() },
      items: items
    };
  }

  const api = { build: build };

  root.SP = root.SP || {};
  root.SP.sample = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
