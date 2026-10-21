import {
  createCustomerClient,
  CustomerApiError,
  customerEndpointAllowed,
} from '../packages/api-client/dist/index.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { URLSearchParams } from 'node:url';
import { CustomerService } from '../apps/api/dist/customers/customer.service.js';
import { PrismaCustomerUnitOfWork } from '../apps/api/dist/infrastructure/prisma.customers.js';

const permissions = [
  'customers.read',
  'customers.create',
  'customers.update',
  'customers.archive',
];
export async function customerCases(suite, db, fixture, harness) {
  const unit = new PrismaCustomerUnitOfWork(db);
  const service = new CustomerService(unit);
  async function tenant() {
    const t = await fixture();
    await db.rolePermission.createMany({
      data: permissions.map((permissionKey) => ({
        organizationId: t.organization.id,
        roleId: t.role.id,
        permissionKey,
      })),
    });
    return t;
  }
  const input = (extra = {}) => ({
    type: 'COMPANY',
    displayName: 'Test customer',
    ...extra,
  });
  const create = (t, extra = {}) =>
    service.create(t.principal, t.organization.id, input(extra), randomUUID());
  await suite.test(
    'customers CRUD preserves omitted fields, archives without deleting, and denies inactive edits',
    async () => {
      const t = await tenant();
      const row = await create(t, {
        primaryEmail: 'office@example.test',
        notes: 'Preserve this note',
      });
      assert.equal(row.createdById, t.user.id);
      assert.ok(row.customerNumber.startsWith('C-'));
      const updated = await service.update(
        t.principal,
        t.organization.id,
        row.id,
        { displayName: 'Updated' },
        randomUUID(),
      );
      assert.equal(updated.primaryEmail, 'office@example.test');
      assert.equal(updated.notes, 'Preserve this note');
      assert.equal(
        (await service.get(t.principal, t.organization.id, row.id)).displayName,
        'Updated',
      );
      await service.archive(
        t.principal,
        t.organization.id,
        row.id,
        randomUUID(),
      );
      assert.equal(
        (await service.list(t.principal, t.organization.id, {})).items.length,
        0,
      );
      assert.equal(
        (
          await service.list(t.principal, t.organization.id, {
            status: 'INACTIVE',
          })
        ).items[0].id,
        row.id,
      );
      await assert.rejects(
        service.update(
          t.principal,
          t.organization.id,
          row.id,
          { notes: 'No' },
          randomUUID(),
        ),
        { code: 'INACTIVE_CUSTOMER' },
      );
      await assert.rejects(
        service.saveContact(
          t.principal,
          t.organization.id,
          row.id,
          null,
          { name: 'No' },
          randomUUID(),
        ),
        { code: 'INACTIVE_CUSTOMER' },
      );
      await assert.rejects(
        service.saveAddress(
          t.principal,
          t.organization.id,
          row.id,
          null,
          {
            type: 'SITE',
            label: 'No',
            countryCode: 'TR',
            city: 'City',
            line1: 'Address',
          },
          randomUUID(),
        ),
        { code: 'INACTIVE_CUSTOMER' },
      );
      await service.archive(
        t.principal,
        t.organization.id,
        row.id,
        randomUUID(),
      );
      assert.equal(
        await db.auditEvent.count({
          where: { targetId: row.id, action: 'CUSTOMER_ARCHIVED' },
        }),
        1,
      );
    },
  );
  await suite.test(
    'customer operations enforce permissions, live membership and tenant boundaries; platform access grants nothing',
    async () => {
      const a = await tenant(),
        b = await tenant(),
        denied = await fixture();
      const row = await create(a);
      await assert.rejects(
        service.create(
          denied.principal,
          denied.organization.id,
          input(),
          randomUUID(),
        ),
        { code: 'ACCESS_DENIED' },
      );
      for (const work of [
        () => service.get(b.principal, a.organization.id, row.id),
        () => service.list(b.principal, a.organization.id, {}),
        () =>
          service.create(b.principal, a.organization.id, input(), randomUUID()),
      ])
        await assert.rejects(work(), { code: 'ACCESS_DENIED' });
      for (const work of [
        () => service.get(b.principal, b.organization.id, row.id),
        () =>
          service.update(
            b.principal,
            b.organization.id,
            row.id,
            { displayName: 'Attack' },
            randomUUID(),
          ),
        () =>
          service.archive(b.principal, b.organization.id, row.id, randomUUID()),
        () => service.contacts(b.principal, b.organization.id, row.id),
        () => service.addresses(b.principal, b.organization.id, row.id),
      ])
        await assert.rejects(work(), { code: 'NOT_FOUND' });
      const role = await db.platformRole.create({
        data: {
          name: randomUUID(),
          permissions: {
            create: { permissionKey: 'platform.organization.create' },
          },
        },
      });
      await db.platformAccess.create({
        data: {
          userId: denied.user.id,
          active: true,
          roles: { create: { roleId: role.id } },
        },
      });
      await assert.rejects(
        service.get(denied.principal, a.organization.id, row.id),
        { code: 'ACCESS_DENIED' },
      );
      await db.rolePermission.deleteMany({
        where: { roleId: a.role.id, permissionKey: 'customers.update' },
      });
      await assert.rejects(
        service.update(
          a.principal,
          a.organization.id,
          row.id,
          { displayName: 'Denied' },
          randomUUID(),
        ),
        { code: 'ACCESS_DENIED' },
      );
      await db.membership.update({
        where: { id: a.membership.id },
        data: { status: 'INACTIVE' },
      });
      await assert.rejects(service.list(a.principal, a.organization.id, {}), {
        code: 'ACCESS_DENIED',
      });
    },
  );
  await suite.test(
    'identifiers are normalized and tenant/country/kind scoped; invalid and duplicate identifiers rejected',
    async () => {
      const a = await tenant(),
        b = await tenant();
      const identifier = {
        identifierCountry: 'TR',
        identifierKind: 'TAX',
        identifierValue: 'abc-123',
      };
      const row = await create(a, identifier);
      assert.equal(row.identifierValue, 'ABC123');
      await assert.rejects(
        create(a, { ...identifier, identifierValue: 'ABC 123' }),
        { code: 'CONFLICT' },
      );
      await create(b, identifier);
      await create(a, { ...identifier, identifierCountry: 'DE' });
      await assert.rejects(create(a, { identifierValue: '123' }), {
        code: 'INVALID_INPUT',
      });
      await assert.rejects(
        create(a, { ...identifier, identifierValue: '---' }),
        { code: 'INVALID_INPUT' },
      );
      await assert.rejects(
        create(a, { ...identifier, identifierValue: '<script>' }),
        { code: 'INVALID_INPUT' },
      );
      await assert.rejects(create(a, { organizationId: b.organization.id }), {
        code: 'INVALID_INPUT',
      });
      await assert.rejects(create(a, { primaryEmail: 'invalid' }), {
        code: 'INVALID_INPUT',
      });
      await assert.rejects(
        service.update(
          a.principal,
          a.organization.id,
          row.id,
          { identifierCountry: null },
          randomUUID(),
        ),
        { code: 'INVALID_INPUT' },
      );
      await service.archive(
        a.principal,
        a.organization.id,
        row.id,
        randomUUID(),
      );
      await assert.rejects(create(a, identifier), { code: 'CONFLICT' });
      const cleared = await create(a);
      assert.equal(cleared.identifierValue, null);
    },
  );
  await suite.test(
    'contacts and addresses support multiple records, scoped edits and explicit primary uniqueness',
    async () => {
      const a = await tenant(),
        b = await tenant();
      const row = await create(a),
        other = await create(a),
        foreign = await create(b);
      const contact = await service.saveContact(
        a.principal,
        a.organization.id,
        row.id,
        null,
        { name: 'Contact', phone: '+90 (212) 555-1234', isPrimary: true },
        randomUUID(),
      );
      await assert.rejects(
        service.saveContact(
          a.principal,
          a.organization.id,
          row.id,
          null,
          { name: 'Other', isPrimary: true },
          randomUUID(),
        ),
        { code: 'CONFLICT' },
      );
      const changed = await service.saveContact(
        a.principal,
        a.organization.id,
        row.id,
        contact.id,
        { title: 'Purchasing' },
        randomUUID(),
      );
      assert.equal(changed.isPrimary, true);
      assert.equal(changed.phone, contact.phone);
      await assert.rejects(
        service.saveContact(
          a.principal,
          a.organization.id,
          row.id,
          contact.id,
          { active: false },
          randomUUID(),
        ),
        { code: 'INVALID_INPUT' },
      );
      await service.saveContact(
        a.principal,
        a.organization.id,
        row.id,
        contact.id,
        { active: false, isPrimary: false },
        randomUUID(),
      );
      await service.saveContact(
        a.principal,
        a.organization.id,
        row.id,
        null,
        { name: 'Replacement', isPrimary: true },
        randomUUID(),
      );
      const data = {
        type: 'BILLING',
        label: 'Office',
        countryCode: 'DE',
        city: 'Berlin',
        line1: 'Test street',
        isPrimary: true,
      };
      const address = await service.saveAddress(
        a.principal,
        a.organization.id,
        row.id,
        null,
        data,
        randomUUID(),
      );
      await assert.rejects(
        service.saveAddress(
          a.principal,
          a.organization.id,
          row.id,
          null,
          data,
          randomUUID(),
        ),
        { code: 'CONFLICT' },
      );
      await service.saveAddress(
        a.principal,
        a.organization.id,
        row.id,
        null,
        { ...data, type: 'SITE' },
        randomUUID(),
      );
      await service.saveAddress(
        a.principal,
        a.organization.id,
        row.id,
        address.id,
        { postalCode: '10115' },
        randomUUID(),
      );
      assert.equal(
        (await service.addresses(a.principal, a.organization.id, row.id))
          .length,
        2,
      );
      for (const owner of [other, foreign]) {
        await assert.rejects(
          service.saveContact(
            a.principal,
            a.organization.id,
            owner.id,
            contact.id,
            { name: 'Attack' },
            randomUUID(),
          ),
          { code: 'NOT_FOUND' },
        );
        await assert.rejects(
          service.saveAddress(
            a.principal,
            a.organization.id,
            owner.id,
            address.id,
            { city: 'Attack' },
            randomUUID(),
          ),
          { code: 'NOT_FOUND' },
        );
      }
      await assert.rejects(
        db.customerContact.create({
          data: {
            organizationId: b.organization.id,
            customerId: row.id,
            name: 'Cross tenant',
          },
        }),
      );
      await assert.rejects(
        db.customerAddress.create({
          data: {
            organizationId: b.organization.id,
            customerId: row.id,
            ...data,
          },
        }),
      );
    },
  );
  await suite.test(
    'customer search covers identifiers, contact names, normalized phones and email with stable bounded pagination',
    async () => {
      const t = await tenant();
      const row = await create(t, {
        displayName: 'Rental Partner',
        identifierCountry: 'TR',
        identifierKind: 'TAX',
        identifierValue: 'ZZ-789',
        primaryEmail: 'sales@example.test',
      });
      await service.saveContact(
        t.principal,
        t.organization.id,
        row.id,
        null,
        {
          name: 'Unique Contact',
          phone: '+90 (212) 555-1234',
          email: 'buyer@example.test',
        },
        randomUUID(),
      );
      for (const q of [
        'Rental Partner',
        'ZZ-789',
        'Unique Contact',
        '90212555',
        'buyer@example.test',
        'sales@example.test',
      ])
        assert.equal(
          (await service.list(t.principal, t.organization.id, { q })).items[0]
            .id,
          row.id,
        );
      for (let i = 0; i < 4; i++) await create(t, { displayName: `Page ${i}` });
      const ids = [];
      let cursor;
      do {
        const result = await service.list(t.principal, t.organization.id, {
          limit: '2',
          ...(cursor ? { cursor } : {}),
        });
        ids.push(...result.items.map((v) => v.id));
        cursor = result.nextCursor;
      } while (cursor);
      assert.equal(ids.length, 5);
      assert.equal(new Set(ids).size, 5);
      await assert.rejects(
        service.list(t.principal, t.organization.id, { limit: 101 }),
        { code: 'INVALID_INPUT' },
      );
      await assert.rejects(
        service.list(t.principal, t.organization.id, { cursor: 'invalid' }),
        { code: 'INVALID_INPUT' },
      );
    },
  );
  await suite.test(
    'customer mutations roll back on audit failure and successful audits omit personal fields',
    async () => {
      const t = await tenant();
      const row = await create(t, { notes: 'private-marker' });
      const failing = new CustomerService({
        run: (work) =>
          unit.run((repos) =>
            work({
              ...repos,
              audit: {
                append: async () => {
                  throw new Error('Audit failure');
                },
              },
            }),
          ),
      });
      await assert.rejects(
        failing.create(t.principal, t.organization.id, input(), randomUUID()),
      );
      await assert.rejects(
        failing.update(
          t.principal,
          t.organization.id,
          row.id,
          { displayName: 'Rollback' },
          randomUUID(),
        ),
      );
      await assert.rejects(
        failing.archive(t.principal, t.organization.id, row.id, randomUUID()),
      );
      await assert.rejects(
        failing.saveContact(
          t.principal,
          t.organization.id,
          row.id,
          null,
          { name: 'Rollback' },
          randomUUID(),
        ),
      );
      await assert.rejects(
        failing.saveAddress(
          t.principal,
          t.organization.id,
          row.id,
          null,
          {
            type: 'SITE',
            label: 'Rollback',
            countryCode: 'TR',
            city: 'Test',
            line1: 'Test',
          },
          randomUUID(),
        ),
      );
      assert.equal(
        await db.customer.count({
          where: { organizationId: t.organization.id },
        }),
        1,
      );
      assert.equal(
        (await service.get(t.principal, t.organization.id, row.id)).active,
        true,
      );
      assert.equal(
        (await service.get(t.principal, t.organization.id, row.id)).displayName,
        'Test customer',
      );
      assert.equal(
        (await service.contacts(t.principal, t.organization.id, row.id)).length,
        0,
      );
      assert.equal(
        (await service.addresses(t.principal, t.organization.id, row.id))
          .length,
        0,
      );
      const events = await db.auditEvent.findMany({
        where: {
          organizationId: t.organization.id,
          action: { startsWith: 'CUSTOMER_' },
        },
      });
      assert.equal(events.length, 1);
      assert.equal(events[0].actorUserId, t.user.id);
      assert.deepEqual(events[0].metadata, {});
      assert.ok(!JSON.stringify(events).includes('private-marker'));
    },
  );
  await suite.test(
    'concurrent duplicate customer identifiers and primary contacts cannot both commit',
    async () => {
      const t = await tenant();
      const identifier = {
        identifierCountry: 'TR',
        identifierKind: 'TAX',
        identifierValue: 'TEST-CONCURRENT',
      };
      const results = await Promise.allSettled([
        create(t, identifier),
        create(t, identifier),
      ]);
      assert.equal(results.filter((v) => v.status === 'fulfilled').length, 1);
      const row = results.find((v) => v.status === 'fulfilled').value;
      const contacts = await Promise.allSettled(
        [1, 2].map((n) =>
          service.saveContact(
            t.principal,
            t.organization.id,
            row.id,
            null,
            { name: `Primary ${n}`, isPrimary: true },
            randomUUID(),
          ),
        ),
      );
      assert.equal(contacts.filter((v) => v.status === 'fulfilled').length, 1);
    },
  );
  await suite.test(
    'Customer HTTP endpoints enforce guards and scoped child routes',
    async () => {
      const {
        Test,
        FoundationModule,
        DATABASE,
        IdentityVerifier,
        TestVerifier,
      } = harness;
      const t = await tenant(),
        denied = await fixture();
      const module = await Test.createTestingModule({
        imports: [FoundationModule],
      })
        .overrideProvider(DATABASE)
        .useValue(db)
        .overrideProvider(IdentityVerifier)
        .useValue(new TestVerifier())
        .compile();
      const app = module.createNestApplication({ logger: false });
      try {
        await app.listen(0, '127.0.0.1');
        const base = await app.getUrl();
        const root = `${base}/organizations/${t.organization.id}/customers`;
        const headers = {
          authorization: `Bearer test-${t.user.id}`,
          'content-type': 'application/json',
        };
        assert.equal((await fetch(root)).status, 401);
        assert.equal(
          (
            await fetch(root, {
              headers: { authorization: `Bearer test-${denied.user.id}` },
            })
          ).status,
          403,
        );
        const response = await fetch(root, {
          method: 'POST',
          headers,
          body: JSON.stringify(input()),
        });
        assert.equal(response.status, 201);
        const row = await response.json();
        assert.equal(
          (await fetch(`${root}?q=Test&limit=1`, { headers })).status,
          200,
        );
        const read = await fetch(`${root}/${row.id}`, { headers });
        assert.equal(read.headers.get('cache-control'), 'no-store');
        assert.equal(
          (
            await fetch(`${root}/${row.id}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ displayName: 'HTTP update' }),
            })
          ).status,
          200,
        );
        const contact = await fetch(`${root}/${row.id}/contacts`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: 'HTTP contact' }),
        });
        assert.equal(contact.status, 201);
        const person = await contact.json();
        assert.equal(
          (
            await fetch(`${root}/${row.id}/contacts/${person.id}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ active: false }),
            })
          ).status,
          200,
        );
        assert.equal(
          (await fetch(`${root}/${row.id}/contacts`, { headers })).status,
          200,
        );
        const address = await fetch(`${root}/${row.id}/addresses`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type: 'BILLING',
            label: 'HQ',
            countryCode: 'TR',
            city: 'Istanbul',
            line1: 'Test',
          }),
        });
        assert.equal(address.status, 201);
        const place = await address.json();
        assert.equal(
          (
            await fetch(`${root}/${row.id}/addresses/${place.id}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ city: 'Ankara' }),
            })
          ).status,
          200,
        );
        assert.equal(
          (await fetch(`${root}/${row.id}/addresses`, { headers })).status,
          200,
        );
        assert.equal(
          (
            await fetch(`${root}/${row.id}/archive`, {
              method: 'POST',
              headers,
            })
          ).status,
          201,
        );
        assert.equal(
          (
            await fetch(`${root}/${row.id}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ notes: 'No' }),
            })
          ).status,
          409,
        );
      } finally {
        await app.close();
      }
    },
  );

  await suite.test(
    'Rental customer selector client returns active same-tenant customers for empty and matching search through authenticated HTTP',
    async () => {
      const t = await tenant(),
        other = await tenant();
      const first = await create(t, { displayName: 'Kiralama Test Alpha' }),
        second = await create(t, { displayName: 'Örnek Kiralama Beta' }),
        inactive = await create(t, { displayName: 'Kiralama Archived' });
      await service.archive(
        t.principal,
        t.organization.id,
        inactive.id,
        randomUUID(),
      );
      await create(other, { displayName: 'Kiralama Other Tenant' });
      await db.rolePermission.deleteMany({
        where: { roleId: t.role.id, permissionKey: { not: 'customers.read' } },
      });
      await db.rolePermission.create({
        data: {
          organizationId: t.organization.id,
          roleId: t.role.id,
          permissionKey: 'rentals.create',
        },
      });
      const module = await harness.Test.createTestingModule({
        imports: [harness.FoundationModule],
      })
        .overrideProvider(harness.DATABASE)
        .useValue(db)
        .overrideProvider(harness.IdentityVerifier)
        .useValue(new harness.TestVerifier())
        .compile();
      const app = module.createNestApplication({ logger: false });
      try {
        await app.listen(0, '127.0.0.1');
        const base = await app.getUrl(),
          headers = { authorization: 'Bearer test-' + t.user.id };
        const client = createCustomerClient(base, (url, options) => {
          const request = new URL(url);
          assert.equal(
            customerEndpointAllowed(options.method, request.pathname.slice(1)),
            true,
          );
          return fetch(url, { ...options, headers });
        });
        // This is the old Create Rental request: strict query validation must continue rejecting it.
        assert.equal(
          (
            await fetch(
              base +
                '/organizations/' +
                t.organization.id +
                '/customers?q=&active=true&limit=100',
              { headers },
            )
          ).status,
          400,
        );
        const page = await client.listActive(t.organization.id, '');
        assert.equal(page.nextCursor, null);
        assert.deepEqual(
          new Set(page.items.map((c) => c.id)),
          new Set([first.id, second.id]),
        );
        assert.ok(
          page.items.every(
            (c) => c.active && c.organizationId === t.organization.id,
          ),
        );
        // Exact UI mapping: options use stable id and displayName, including Turkish text.
        assert.deepEqual(
          new Set(page.items.map((c) => c.displayName)),
          new Set(['Kiralama Test Alpha', 'Örnek Kiralama Beta']),
        );
        assert.deepEqual(
          (await client.listActive(t.organization.id, '  Alpha  ')).items.map(
            (c) => c.id,
          ),
          [first.id],
        );
        assert.equal(
          (await client.listActive(t.organization.id, 'Archived')).items.length,
          0,
        );
        assert.equal(
          (await client.listActive(t.organization.id, 'Other Tenant')).items
            .length,
          0,
        );
        const head = await client.list(
          t.organization.id,
          new URLSearchParams({ status: 'ACTIVE', limit: '1' }),
        );
        assert.ok(head.nextCursor);
        const tail = await client.listActive(
          t.organization.id,
          '',
          head.nextCursor,
        );
        assert.equal(tail.items.length, 1);
        assert.notEqual(tail.items[0].id, head.items[0].id);
        await assert.rejects(
          client.listActive(other.organization.id, ''),
          (e) => e instanceof CustomerApiError && e.status === 403,
        );
        await db.rolePermission.deleteMany({
          where: { roleId: t.role.id, permissionKey: 'customers.read' },
        });
        await assert.rejects(
          client.listActive(t.organization.id, ''),
          (e) => e instanceof CustomerApiError && e.status === 403,
        );
        assert.equal(
          (
            await fetch(
              base +
                '/organizations/' +
                t.organization.id +
                '/customers?status=ACTIVE',
            )
          ).status,
          401,
        );
      } finally {
        await app.close();
      }
    },
  );
}
