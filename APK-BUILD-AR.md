# تجهيز IMC Clean Manager لتطبيق Android

هذا المشروع أصبح جاهزاً لمرحلة Capacitor. التطبيق الحالي يحتوي على واجهة React وخادم Express/SQLite، لذلك ملف APK يحتاج خادم API عام يعمل عبر HTTPS.

## قبل بناء APK
1. انشر المشروع على خدمة استضافة Node.js واحصل على رابط HTTPS عام.
2. انسخ `.env.apk.example` إلى `.env` وضع الرابط في `VITE_API_BASE_URL`.
3. ثبّت الاعتمادات ثم نفّذ:
   - `npm install`
   - `npm run cap:sync`
4. إذا كان مجلد Android غير موجود، نفّذ `npx cap add android` مرة واحدة.
5. افتح مجلد Android في Android Studio وابنِ APK من Build > Generate App Bundle / APK > Generate APK.

## ملاحظة مهمة
لا يمكن تحويل الخادم Express/SQLite نفسه إلى APK بمجرد ضغطه داخل التطبيق؛ الـAPK يحتاج الاتصال بخادم API. قاعدة SQLite الحالية محلية للخادم، ولذلك يجب أن يكون الخادم على استضافة مناسبة للاستخدام الفعلي.
