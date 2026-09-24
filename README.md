# Order Management System

ქართული ონლაინ შეკვეთების მართვის სისტემა.

## ტექნოლოგიები
Next.js + TypeScript + Supabase.

## გაშვება
1. დააყენე Node.js 20+.
2. შექმენი `.env.local` `.env.example`-ის მიხედვით.
3. გაუშვი `npm install`.
4. გაუშვი `npm run dev`.
5. გახსენი `http://localhost:3000`.

## Supabase
SQL Editor-ში უკვე უნდა გქონდეს შესრულებული მონაცემთა ბაზის სკრიპტი, რომელიც ამ პროექტის ცხრილებს ქმნის.

## პირველი ადმინისტრატორი
Supabase Authentication-ში შექმენი პირველი მომხმარებელი. შემდეგ `profiles` ცხრილში ამ მომხმარებლის `role` შეცვალე `admin`-ზე.

## უსაფრთხოება
არ ატვირთო `.env.local`, service role key ან სხვა secret GitHub-ზე.
