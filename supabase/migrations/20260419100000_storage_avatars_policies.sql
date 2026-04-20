-- Storage RLS policies for the avatars bucket.
-- Avatar path convention: {user_id}/avatar.{ext}
-- e.g. "abc-123/avatar.jpg"

-- Users can upload into their own subfolder
create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update files in their own subfolder
create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete files in their own subfolder
create policy "Users can delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read access
create policy "Public avatar read access"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');
