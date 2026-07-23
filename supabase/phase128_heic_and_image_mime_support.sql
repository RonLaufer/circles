-- Circles phase 128: HEIC/HEIF conversion output and image MIME support

begin;

update storage.buckets
set allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png']
where id in ('profile-images', 'community-images', 'event-images');

update storage.buckets
set allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'video/mp4']
where id = 'event-gallery';

commit;
