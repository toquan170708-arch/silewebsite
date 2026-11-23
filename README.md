# Website bán hàng riêng

Website Node.js + Express, không dùng Shopify. Gồm trang khách hàng, giỏ hàng, đặt hàng, đăng ký/đăng nhập, trang quản trị `/admin`, quản lý sản phẩm/đơn hàng/khách hàng/cài đặt và điểm kết nối chatbot AI.

## Chạy trên máy tính Windows

1. Cài Node.js 20 trở lên: https://nodejs.org/
2. Giải nén thư mục.
3. Mở Terminal/CMD tại thư mục vừa giải nén.
4. Chạy:
   ```bash
   npm install
   ```
5. Sao chép `.env.example` thành `.env`, rồi sửa `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
6. Chạy `npm start`.
7. Mở `http://localhost:3000` (website) hoặc `http://localhost:3000/admin` (quản trị).

## Đưa website lên Internet bằng Render

1. Tạo tài khoản GitHub và Render.
2. Tải thư mục này lên một repository GitHub riêng.
3. Trên Render chọn **New > Blueprint**, kết nối repository và dùng file `render.yaml`.
4. Nhập `ADMIN_EMAIL` và `ADMIN_PASSWORD` khi Render yêu cầu. Đặt mật khẩu quản trị mạnh.
5. Chờ deploy; Render cấp một địa chỉ dạng `https://ten-website.onrender.com`.
6. Muốn có tên miền riêng (ví dụ tenmiencuaban.com), mua domain rồi kết nối trong phần Settings của dịch vụ Render.

**Lưu ý dữ liệu:** `render.yaml` khai báo persistent disk cho dữ liệu JSON và ảnh tải lên. Không xóa disk nếu muốn giữ dữ liệu. Gói hosting và domain có thể phát sinh phí theo nhà cung cấp.

## Bật chatbot AI

1. Tạo API key tại nhà cung cấp AI bạn chọn.
2. Trong Render > Environment, đặt `AI_API_KEY` và `AI_MODEL`. Mặc định cấu hình theo API tương thích OpenAI (`gpt-4o-mini`).
3. Nếu dùng nhà cung cấp tương thích API khác, đổi `AI_BASE_URL` và `AI_MODEL` theo tài liệu của nhà cung cấp.
4. Deploy lại.

Không đặt API key trong file JavaScript phía trình duyệt hoặc gửi key cho khách hàng. Chatbot chỉ được phép tư vấn theo thông tin sản phẩm hiện có; khi chưa có dữ liệu, chatbot cần nói rõ.

## Tài khoản quản trị lần đầu

Email và mật khẩu lấy từ `ADMIN_EMAIL` và `ADMIN_PASSWORD` trong `.env` hoặc Environment của hosting. Đăng nhập tại `/admin`.

## Phạm vi bản khởi đầu

- Có quản lý sản phẩm, hình ảnh, danh mục, giá, tồn kho, trạng thái hiển thị.
- Có giỏ hàng, đặt hàng và cập nhật trạng thái đơn.
- Có đăng ký/đăng nhập khách hàng và chatbot AI khi cấu hình API.
- Đây là bản nền tảng khởi đầu. Chưa tích hợp thanh toán online, vận chuyển, email/SMS, phân quyền nhiều cấp chi tiết hoặc hệ thống khôi phục mật khẩu. Cần bổ sung và kiểm thử trước khi dùng để kinh doanh thực tế.
