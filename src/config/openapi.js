const swaggerJSDoc = require('swagger-jsdoc');

const specification = swaggerJSDoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Beauty Clinic API',
      version: '1.0.0',
      description: 'REST API کلینیک زیبایی'
    },
    servers: [{
      url: `${process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 3000}`}${process.env.API_PREFIX || '/api/v1'}`
    }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {},
            message: { type: 'string' },
            meta: {}
          }
        }
      }
    },
    paths: {
      '/health': {
        get: { summary: 'بررسی وضعیت سرویس', responses: { 200: { description: 'سرویس فعال است' } } }
      },
      '/auth/otp/request': {
        post: {
          summary: 'ارسال کد ورود یک‌بارمصرف',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['phone'],
                  properties: { phone: { type: 'string', example: '09123456789' } }
                }
              }
            }
          },
          responses: { 200: { description: 'کد ارسال شد' }, 429: { description: 'محدودیت درخواست' } }
        }
      },
      '/auth/otp/verify': {
        post: {
          summary: 'تأیید کد و ورود/ثبت‌نام',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['phone', 'code'],
                  properties: { phone: { type: 'string' }, code: { type: 'string', example: '12345' } }
                }
              }
            }
          },
          responses: { 200: { description: 'توکن‌های نشست' } }
        }
      },
      '/services': {
        get: { summary: 'فهرست عمومی خدمات', responses: { 200: { description: 'خدمات' } } }
      },
      '/appointments/slots': {
        get: {
          summary: 'زمان‌های خالی پزشک',
          parameters: [
            { name: 'serviceId', in: 'query', required: true, schema: { type: 'integer' } },
            { name: 'doctorId', in: 'query', required: true, schema: { type: 'integer' } },
            { name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date' } }
          ],
          responses: { 200: { description: 'ساعت‌های آزاد' } }
        }
      },
      '/appointments': {
        post: {
          summary: 'رزرو نوبت',
          security: [{ bearerAuth: [] }],
          responses: { 201: { description: 'نوبت ثبت شد' } }
        }
      },
      '/settings/public': {
        get: { summary: 'تنظیمات عمومی قابل نمایش', responses: { 200: { description: 'تنظیمات عمومی' } } }
      }
    }
  },
  apis: []
});

const documentedRoutes = [
  ['/auth/refresh', 'post', 'تمدید نشست', true],
  ['/auth/logout', 'post', 'خروج از حساب', true],
  ['/auth/admin/password', 'post', 'ورود کارکنان با ایمیل و رمز', false],
  ['/auth/me', 'get', 'مشاهده حساب کاربری', true],
  ['/auth/profile', 'patch', 'تکمیل پروفایل', true],
  ['/service-categories', 'get', 'فهرست دسته‌بندی خدمات', false],
  ['/services/{slug}', 'get', 'جزئیات خدمت', false],
  ['/doctors', 'get', 'فهرست پزشکان و اپراتورها', false],
  ['/doctors/{id}', 'get', 'جزئیات پزشک', false],
  ['/portfolio', 'get', 'نمونه‌کارهای منتشرشده', false],
  ['/gallery', 'get', 'گالری کلینیک', false],
  ['/reviews', 'get', 'نظرات تأییدشده', false],
  ['/articles', 'get', 'فهرست مقالات', false],
  ['/articles/{slug}', 'get', 'جزئیات مقاله', false],
  ['/pages/{slug}', 'get', 'صفحه ثابت', false],
  ['/appointments/mine', 'get', 'نوبت‌های من', true],
  ['/appointments/{id}/reschedule', 'patch', 'جابه‌جایی نوبت', true],
  ['/appointments/{id}/cancel', 'post', 'لغو نوبت', true],
  ['/reviews', 'post', 'ثبت نظر برای تأیید', true],
  ['/consultations', 'post', 'ثبت درخواست مشاوره', true],
  ['/tickets', 'get', 'فهرست تیکت‌ها', true],
  ['/tickets', 'post', 'ایجاد تیکت', true],
  ['/tickets/{id}/messages', 'get', 'مشاهده گفت‌وگوی تیکت', true],
  ['/tickets/{id}/messages', 'post', 'ارسال پیام تیکت', true],
  ['/admin/settings', 'get', 'مشاهده تنظیمات', true],
  ['/admin/settings', 'patch', 'ویرایش تنظیمات', true],
  ['/admin/dashboard', 'get', 'آمار داشبورد', true],
  ['/admin/users', 'get', 'مدیریت کاربران', true],
  ['/admin/users/{id}/block', 'patch', 'مسدودسازی کاربر', true],
  ['/admin/users/{id}/role', 'patch', 'تغییر نقش کاربر', true],
  ['/admin/users/{id}/password', 'patch', 'تنظیم دسترسی رمز کارکنان', true],
  ['/admin/appointments', 'get', 'مدیریت نوبت‌ها', true],
  ['/admin/appointments', 'post', 'ثبت دستی نوبت', true],
  ['/admin/appointments/{id}/status', 'patch', 'تغییر وضعیت نوبت', true],
  ['/admin/appointments/export.csv', 'get', 'خروجی CSV نوبت‌ها', true],
  ['/admin/uploads', 'post', 'بارگذاری تصویر یا PDF', true],
  ['/admin/reviews', 'get', 'مدیریت نظرات', true],
  ['/admin/reviews/{id}/approval', 'patch', 'تأیید یا رد نظر', true],
  ['/admin/consultations', 'get', 'مدیریت درخواست‌های مشاوره', true],
  ['/admin/consultations/{id}/status', 'patch', 'تغییر وضعیت مشاوره', true],
  ['/admin/tickets', 'get', 'مدیریت تیکت‌ها', true],
  ['/admin/tickets/{id}/messages', 'post', 'پاسخ به تیکت', true],
  ['/admin/audit-logs', 'get', 'گزارش فعالیت مدیران', true]
];

for (const resource of ['services', 'service-categories', 'doctors', 'articles', 'pages', 'gallery', 'portfolio', 'holidays']) {
  documentedRoutes.push([`/admin/${resource}`, 'get', `فهرست ${resource}`, true]);
  documentedRoutes.push([`/admin/${resource}`, 'post', `ایجاد ${resource}`, true]);
  documentedRoutes.push([`/admin/${resource}/{id}`, 'get', `مشاهده ${resource}`, true]);
  documentedRoutes.push([`/admin/${resource}/{id}`, 'patch', `ویرایش ${resource}`, true]);
  documentedRoutes.push([`/admin/${resource}/{id}`, 'delete', `حذف ${resource}`, true]);
}
documentedRoutes.push(
  ['/admin/doctors/{doctorId}/services', 'post', 'اتصال خدمات به پزشک', true],
  ['/admin/doctors/{doctorId}/schedules', 'get', 'مشاهده برنامه پزشک', true],
  ['/admin/doctors/{doctorId}/schedules', 'put', 'تنظیم برنامه پزشک', true],
  ['/admin/doctors/{doctorId}/documents', 'get', 'فهرست مدارک پزشک', true],
  ['/admin/doctors/{doctorId}/documents', 'post', 'ثبت مدرک پزشک', true],
  ['/admin/doctors/{doctorId}/documents/{documentId}', 'patch', 'ویرایش مدرک پزشک', true],
  ['/admin/doctors/{doctorId}/documents/{documentId}', 'delete', 'حذف مدرک پزشک', true]
);

for (const [path, method, summary, secured] of documentedRoutes) {
  specification.paths[path] ||= {};
  const operation = {
    summary,
    responses: {
      200: { description: 'عملیات با موفقیت انجام شد' },
      400: { description: 'درخواست نامعتبر است' },
      401: { description: 'احراز هویت لازم است' }
    }
  };
  if (secured) operation.security = [{ bearerAuth: [] }];
  if (['post', 'patch', 'put'].includes(method)) {
    operation.requestBody = {
      content: {
        'application/json': {
          schema: { type: 'object', additionalProperties: true }
        }
      }
    };
  }
  const pathParameters = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1], in: 'path', required: true, schema: { type: 'string' }
  }));
  if (pathParameters.length) operation.parameters = pathParameters;
  specification.paths[path][method] = operation;
}

module.exports = specification;
