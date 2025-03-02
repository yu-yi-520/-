<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>旅行相册</title>
    <style>
        :root {
            --primary-color: #d6583b;
            --secondary-color: #333;
        }
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        header {
            text-align: center;
            margin-bottom: 30px;
            position: relative;
        }
        h1 {
            color: var(--secondary-color);
            margin-bottom: 10px;
        }
        .upload-container {
            position: absolute;
            top: 0;
            right: 0;
        }
        .upload-button {
            background-color: var(--primary-color);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            display: inline-block;
            font-weight: bold;
        }
        .upload-button:hover {
            opacity: 0.9;
        }
        #file-upload {
            display: none;
        }
        .gallery {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
        }
        .gallery-item {
            position: relative;
            overflow: hidden;
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1), 0 8px 16px rgba(0,0,0,0.2);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .gallery-item:hover {
            transform: translateY(-5px);
        }
        .delete-btn {
            position: absolute;
            top: 4px;
            right: 8px;
            background: rgba(255, 0, 0, 0.8);
            color: white;
            border: none;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            z-index: 2;
        }
        .delete-btn:hover {
            background: rgba(255, 0, 0, 1);
        }
        .gallery-item img {
            width: 100%;
            min-height: 200px;
            max-height: 300px;
            object-fit: contain;
            display: block;
            transition: transform 0.3s ease;
        }
        .gallery-item:hover img {
            transform: scale(1.1);
        }
        .gallery-item .overlay {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px;
            transform: translateY(100%);
            transform-origin: bottom;
            transition: transform 0.3s ease;
            outline: none;
            cursor: text;
            overflow-wrap: break-word;
            min-height: 40px;
            display: flex;
            align-items: center;
            box-sizing: border-box;
        }
        .gallery-item:hover .overlay {
            transform: translateY(0);
        }
        .lightbox {
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0);
            justify-content: center;
            align-items: center;
            display: flex;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
        }
        .lightbox img {
            max-width: 90%;
            max-height: 90%;
            border-radius: 10px;
            transform: scale(0.8);
            transition: transform 0.3s ease;
        }
        .lightbox.active {
            background: rgba(0, 0, 0, 0.9);
            opacity: 1;
            visibility: visible;
        }
        .lightbox.active img {
            transform: scale(1);
        }
        @media (max-width: 600px) {
            .gallery {
                grid-template-columns: repeat(2, 1fr);
            }
            .gallery-item img {
                height: 150px;
            }
        }
    </style>
</head>
<body>
    <header>
        <h1>旅行相册</h1>
        <p>用oppo find x 8 ultra ，记录生活。</p>
        <div class="upload-container">
            <label for="file-upload" class="upload-button">
                <span>+ 上传</span>
                <input type="file" id="file-upload" accept="image/*">
            </label>
        </div>
    </header>
    <div class="gallery">
        <!-- 修改现有图片项 -->
        <div class="gallery-item">
            <button class="delete-btn" onclick="this.parentElement.remove()">×</button>
            <img src="C:\Users\yu\Desktop\666_PixCake\IMG_20250302_020301.jpg">
            <div class="overlay" contenteditable="true">男娘老婆</div>
        </div>
        <div class="gallery-item">
            <button class="delete-btn" onclick="this.parentElement.remove()">×</button>
            <img src="C:\Users\yu\Desktop\666_PixCake\IMG_20250302_020342.jpg">
            <div class="overlay" contenteditable="true">男娘老婆</div>
        </div>
        <div class="gallery-item">
            <button class="delete-btn" onclick="this.parentElement.remove()">×</button>
            <img src="C:\Users\yu\Desktop\666_PixCake\IMG_20250302_020823.jpg">
            <div class="overlay" contenteditable="true">男娘老婆</div> <!-- 添加可编辑属性 -->
        </div>
    </div>

    <!-- 添加lightbox结构 -->
    <div class="lightbox">
        <img src="" alt="">
        <button class="close-btn">×</button>
    </div>

    <script>
        // 添加lightbox功能
        const lightbox = document.querySelector('.lightbox');
        const lightboxImg = lightbox.querySelector('img');
        const closeBtn = lightbox.querySelector('.close-btn');

        // 关闭lightbox
        closeBtn.addEventListener('click', () => {
            lightbox.classList.remove('active');
            setTimeout(() => {
                lightboxImg.src = '';
            }, 300); // 等待动画完成再清空图片
        });

        // 点击外部关闭
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                lightbox.classList.remove('active');
                setTimeout(() => {
                    lightboxImg.src = '';
                }, 300);
            }
        });

        // 为所有图片添加点击事件
        document.querySelectorAll('.gallery-item img').forEach(img => {
            img.addEventListener('click', () => {
                lightboxImg.src = img.src;
                setTimeout(() => {
                    lightbox.classList.add('active');
                }, 10); // 小延迟确保DOM更新
            });
        });

        // 初始化事件监听（添加编辑功能）
        function initGalleryEvents() {
            // 统一处理所有交互
            document.querySelector('.gallery').addEventListener('input', (e) => {
                if (e.target.classList.contains('overlay')) {
                    // 这里可以添加自动保存逻辑
                    console.log('文本已修改：', e.target.textContent);
                }
            });
        }
        // 获取必要元素
        const fileUpload = document.getElementById('file-upload');
        const gallery = document.querySelector('.gallery');
        // 修复上传功能
        fileUpload.addEventListener('change', (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) {
                alert('请选择有效的图片文件');
                return;
            }
        const reader = new FileReader();
        reader.onload = function(e) {
            const newItem = document.createElement('div');
            newItem.className = 'gallery-item';
            newItem.innerHTML = `
            <button class="delete-btn" onclick="this.parentElement.remove()">×</button>
                <img src="${e.target.result}" alt="上传图片">
                <div class="overlay" contenteditable="true">点击编辑描述</div>
            `;
            gallery.prepend(newItem);
            
            // 为新图片绑定点击事件
            newItem.querySelector('img').addEventListener('click', () => {
                const lightbox = document.querySelector('.lightbox');
                const lightboxImg = lightbox.querySelector('img');
                lightboxImg.src = e.target.result;
                lightbox.classList.add('active');
            });
        };
        reader.readAsDataURL(file);
        });
        e.target.value = ''; // 清空输入以便重复上传
        });
        // 添加图片描述保存功能（示例）
        function saveEdits() {
            const items = document.querySelectorAll('.gallery-item');
            const data = [];
            items.forEach(item => {
                data.push({
                    src: item.querySelector('img').src,
                    text: item.querySelector('.overlay').innerHTML
                });
            });
            localStorage.setItem('photoAlbum', JSON.stringify(data));
        }
        // 初始化时添加自动保存（可选）
        setInterval(saveEdits, 5000);
        initGalleryEvents();
    </script>
</body>
</html>
