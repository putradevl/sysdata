<script>
        let data = null;

        fetch('/dataimg.json')
            .then(response => response.json())
            .then(json => {
                data = json;
                const materialSelect = document.getElementById('material');
                data.Sheet1.forEach((item, index) => {
                    const option = document.createElement('option');
                    option.value = index;
                    option.textContent = item["PRODUKSI"];
                    materialSelect.appendChild(option);
                });
            })
            .catch(err => console.error('Gagal memuat JSON:', err));

        document.getElementById('material').addEventListener('change', () => {
            const selectedIndex = document.getElementById('material').value;
            const selected = data?.Sheet1[selectedIndex];
            const infoDiv = document.getElementById('info');
            const imageContainer = document.getElementById('imageContainer');
            const materialImage = document.getElementById('materialImage');

            if (selected) {
                // LOGIKA MENAMPILKAN GAMBAR
                if (selected["IMG"]) {
                    materialImage.src = selected["IMG"];
                    materialImage.style.display = 'block';
                    imageContainer.style.display = 'block';
                } else {
                    materialImage.src = '';
                    materialImage.style.display = 'none';
                    imageContainer.style.display = 'none';
                }
                // LOGIKA MENAMPILKAN GAMBAR SELESAI

                infoDiv.style.display = 'block';
                let html = `
                    Material: ${selected["NAME MATERIAL"]}<br>
                    No Gudang: ${selected["WAREHOUSE CODE"]}<br>
                    Tinta: ${selected["INK TYPE"]} - ${selected["INK COUNT"]}
                `;

                if (selected["LF PROTECT TYPE"] !== "NO" && selected["LF PROTECT COUNT"] !== "NO") {
                    html += `<br>LF Protect Type: ${selected["LF PROTECT TYPE"]}<br>
                            LF Protect Count: ${selected["LF PROTECT COUNT"]}`;
                }
                if (selected["RETADER KSM 076"] !== "NO") {
                    html += `<br>Retader KSM 076: ${selected["RETADER KSM 076"]}`;
                }
                if (selected["RETADER KSM 051"] !== "NO") {
                    html += `<br>Retader KSM 051: ${selected["RETADER KSM 051"]}`;
                }
                if (selected["HARDENER H1"] !== "NO") {
                    html += `<br>Hardener H1: ${selected["HARDENER H1"]}`;
                }
                if (selected["THINER COUNT"] !== "NO") {
                    html += `<br>Thiner M3: ${selected["THINER COUNT"]}`;
                }

                infoDiv.innerHTML = html;
            } else {
                // RESET GAMBAR
                materialImage.src = '';
                materialImage.style.display = 'none';
                imageContainer.style.display = 'none';
                // RESET GAMBAR SELESAI

                infoDiv.style.display = 'none';
                infoDiv.innerHTML = '';
            }
        });

        // Format angka
        function formatNumber(num) {
            return (num % 1 === 0) ? num.toString() : num.toFixed(2);
        }

        function hitung() {
            const selected = data?.Sheet1[document.getElementById('material').value];
            const good = parseInt(document.getElementById('good').value) || 0;
            const ng = parseInt(document.getElementById('ng').value) || 0;
            const jumlah = good + ng;
            const hasilDiv = document.getElementById('hasil');

            if (!selected || jumlah === 0) {
                hasilDiv.innerHTML = `<span style="color:red;">Pilih material dan masukkan jumlah GOOD atau NG!</span>`;
                return;
            }

            // Mengganti koma dengan titik untuk parsing float
            const inkCount = selected["INK COUNT"] !== "NO" ? parseFloat(selected["INK COUNT"].replace(',', '.')) : 0;
            const thinnerCount = selected["THINER COUNT"] !== "NO" ? parseFloat(selected["THINER COUNT"].replace(',', '.')) : 0;

            const totalInk = inkCount * jumlah;
            const totalThinner = thinnerCount * jumlah;

            let hasilHTML = `<strong>Total Produksi:</strong> ${jumlah} ea (GOOD: ${good} | NG: ${ng})<br>`;
            if (inkCount > 0) hasilHTML += `<strong>Tinta ${selected["INK TYPE"]}:</strong> ${formatNumber(totalInk)} g<br>`;
            if (thinnerCount > 0) hasilHTML += `<strong>Thinner M3:</strong> ${formatNumber(totalThinner)} ml<br>`;

            if (selected["LF PROTECT TYPE"] !== "NO" && selected["LF PROTECT COUNT"] !== "NO") {
                const lfCountMm = parseFloat(selected["LF PROTECT COUNT"].replace(',', '.'));
                const totalLfMm = lfCountMm * jumlah;
                const totalLfCm = Math.round(totalLfMm / 10);
                hasilHTML += `<strong>LF Protect:</strong> ${Math.round(totalLfMm)} mm (${totalLfCm} cm) - ${selected["LF PROTECT TYPE"]}<br>`;
            }

            if (selected["RETADER KSM 076"] !== "NO") {
                const ret076 = parseFloat(selected["RETADER KSM 076"].replace(',', '.')) * jumlah;
                hasilHTML += `<strong>Retader KSM 076:</strong> ${formatNumber(ret076)} ml<br>`;
            }
            if (selected["RETADER KSM 051"] !== "NO") {
                const ret051 = parseFloat(selected["RETADER KSM 051"].replace(',', '.')) * jumlah;
                hasilHTML += `<strong>Retader KSM 051:</strong> ${formatNumber(ret051)} ml<br>`;
            }
            if (selected["HARDENER H1"] !== "NO") {
                const hard1 = parseFloat(selected["HARDENER H1"].replace(',', '.')) * jumlah;
                hasilHTML += `<strong>Hardener H1:</strong> ${formatNumber(hard1)} g<br>`;
            }

            hasilDiv.innerHTML = hasilHTML;
        }

        function resetForm() {
            document.getElementById('material').value = "";
            document.getElementById('good').value = "";
            document.getElementById('ng').value = "";
            document.getElementById('hasil').innerHTML = "";
            document.getElementById('info').style.display = "none";
            document.getElementById('info').innerHTML = "";
            // RESET GAMBAR PADA FORM RESET
            document.getElementById('materialImage').src = "";
            document.getElementById('materialImage').style.display = "none";
            document.getElementById('imageContainer').style.display = "none";
            // RESET GAMBAR PADA FORM RESET SELESAI
        }
        </script>
        

    <script type="module">
        import { requireAuth, logoutUser, updateUserActivity } from './supabase-client.js';

        requireAuth();

        document.getElementById('logoutBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            await logoutUser();
        });

        setInterval(updateUserActivity, 60000);
    </script>
    <script type="module">
    import { requireAuth, logoutUser, updateUserActivity, trackNavigation } from './supabase-client.js';

    requireAuth();
    trackNavigation('Penghitung Material Penyusun');

    document.getElementById('logoutBtn').addEventListener('click', async (e) => {
        e.preventDefault();
        await logoutUser();
    });

    document.querySelectorAll('.sidebar a[data-menu]').forEach(link => {
        link.addEventListener('click', function() {
            const menuName = this.getAttribute('data-menu');
            trackNavigation(menuName);
        });
    });

    setInterval(updateUserActivity, 60000);

    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    function toggleSidebar() {
        menuBtn.classList.toggle('open');
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }

    menuBtn.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', toggleSidebar);
</script>
