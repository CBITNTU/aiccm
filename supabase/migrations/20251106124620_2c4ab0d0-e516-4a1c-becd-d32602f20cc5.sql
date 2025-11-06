-- Add job_title column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN job_title TEXT;