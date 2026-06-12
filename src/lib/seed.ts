/**
 * Seed — Value Research India Pvt. Ltd.
 * Run via:  POST /api/seed
 */

import { createHash, createHmac } from 'node:crypto';
import mongoose                   from 'mongoose';
import { connectDB }              from './mongodb';
import {
  Tenant,
  WorkspaceDepartment,
  WorkspaceEmployee,
  WorkspaceLeaveRequest,
  WorkspacePayrollRun,
  WorkspaceAuditTrail,
  PERF_COMPETENCIES,
  type IWAuditModel,
}                                 from '@/models/workspace.models';
import User                       from '@/models/User';
import {
  TenantContext,
  registerGlobalTenantPlugin,
  encryptEmployeeFields,
  getTenantDEK,
}                                 from '@/infrastructure/multiTenantCore';
import bcrypt                     from 'bcryptjs';

// ── Departments ───────────────────────────────────────────────────────────────

const DEPTS = [
  { name: 'Research',            code: 'RES', costCenterCode: 'CC-001' },
  { name: 'Technology',          code: 'TEC', costCenterCode: 'CC-002' },
  { name: 'Editorial',           code: 'EDI', costCenterCode: 'CC-003' },
  { name: 'Product',             code: 'PRD', costCenterCode: 'CC-004' },
  { name: 'Data & Analytics',    code: 'DTA', costCenterCode: 'CC-005' },
  { name: 'Subscriber Services', code: 'SUB', costCenterCode: 'CC-006' },
  { name: 'Accounts',            code: 'ACC', costCenterCode: 'CC-007' },
  { name: 'Human Resources',     code: 'HRS', costCenterCode: 'CC-008' },
  { name: 'Legal',               code: 'LEG', costCenterCode: 'CC-009' },
  { name: 'Management',          code: 'MGT', costCenterCode: 'CC-010' },
];

// ── Employee fixtures ─────────────────────────────────────────────────────────
// managerCode = employeeCode of direct manager; null = top-level

type EmpFixture = {
  code: string; name: string; email: string;
  dept: string; title: string; salary: number; band: string;
  managerCode: string | null; phone: string; hireDaysAgo: number;
  status?: 'active' | 'on_leave';
};

const VR_EMPLOYEES: EmpFixture[] = [
  // ── RESEARCH (14) ──────────────────────────────────────────────────────────
  { code: 'HR-EMP-00001', name: 'Dhruv Mehta',        email: 'dhruv.mehta@valueresearch.in',        dept: 'Research',            title: 'Senior Research Analyst',  salary: 1500000, band: 'IC5', managerCode: 'HR-EMP-00002', phone: '+91-9810011001', hireDaysAgo: 1200 },
  { code: 'HR-EMP-00002', name: 'Priya Sharma',        email: 'priya.sharma@valueresearch.in',        dept: 'Research',            title: 'Fund Manager',             salary: 3000000, band: 'L4',  managerCode: 'HR-EMP-00064', phone: '+91-9810011002', hireDaysAgo: 1800 },
  { code: 'HR-EMP-00011', name: 'Aditya Agarwal',      email: 'aditya.agarwal@valueresearch.in',      dept: 'Research',            title: 'Research Analyst',         salary: 1000000, band: 'IC4', managerCode: 'HR-EMP-00001', phone: '+91-9810011011', hireDaysAgo: 400 },
  { code: 'HR-EMP-00012', name: 'Riya Bose',           email: 'riya.bose@valueresearch.in',           dept: 'Research',            title: 'Research Analyst',         salary: 1000000, band: 'IC4', managerCode: 'HR-EMP-00001', phone: '+91-9810011012', hireDaysAgo: 380 },
  { code: 'HR-EMP-00013', name: 'Karan Malhotra',      email: 'karan.malhotra@valueresearch.in',      dept: 'Research',            title: 'Senior Research Analyst',  salary: 1500000, band: 'IC5', managerCode: 'HR-EMP-00001', phone: '+91-9810011013', hireDaysAgo: 900 },
  { code: 'HR-EMP-00014', name: 'Pooja Iyer',          email: 'pooja.iyer@valueresearch.in',          dept: 'Research',            title: 'Senior Research Analyst',  salary: 1500000, band: 'IC5', managerCode: 'HR-EMP-00001', phone: '+91-9810011014', hireDaysAgo: 850 },
  { code: 'HR-EMP-00015', name: 'Siddharth Rao',       email: 'siddharth.rao@valueresearch.in',       dept: 'Research',            title: 'Senior Analyst',           salary: 1300000, band: 'IC4', managerCode: 'HR-EMP-00001', phone: '+91-9810011015', hireDaysAgo: 700 },
  { code: 'HR-EMP-00016', name: 'Nandini Sharma',      email: 'nandini.sharma@valueresearch.in',      dept: 'Research',            title: 'Analyst',                  salary: 700000,  band: 'IC3', managerCode: 'HR-EMP-00001', phone: '+91-9810011016', hireDaysAgo: 200 },
  { code: 'HR-EMP-00017', name: 'Yash Tiwari',         email: 'yash.tiwari@valueresearch.in',         dept: 'Research',            title: 'Senior Research Analyst',  salary: 1500000, band: 'IC5', managerCode: 'HR-EMP-00001', phone: '+91-9810011017', hireDaysAgo: 800 },
  { code: 'HR-EMP-00018', name: 'Ishaan Gupta',        email: 'ishaan.gupta@valueresearch.in',        dept: 'Research',            title: 'Associate Fund Manager',   salary: 2000000, band: 'IC5', managerCode: 'HR-EMP-00002', phone: '+91-9810011018', hireDaysAgo: 1100 },
  { code: 'HR-EMP-00019', name: 'Sonal Mehta',         email: 'sonal.mehta@valueresearch.in',         dept: 'Research',            title: 'Research Analyst',         salary: 1000000, band: 'IC4', managerCode: 'HR-EMP-00002', phone: '+91-9810011019', hireDaysAgo: 350 },
  { code: 'HR-EMP-00020', name: 'Varun Khanna',        email: 'varun.khanna@valueresearch.in',        dept: 'Research',            title: 'Senior Research Analyst',  salary: 1500000, band: 'IC5', managerCode: 'HR-EMP-00001', phone: '+91-9810011020', hireDaysAgo: 750 },
  { code: 'HR-EMP-00021', name: 'Simran Sethi',        email: 'simran.sethi@valueresearch.in',        dept: 'Research',            title: 'Senior Analyst',           salary: 1300000, band: 'IC4', managerCode: 'HR-EMP-00002', phone: '+91-9810011021', hireDaysAgo: 600 },
  { code: 'HR-EMP-00022', name: 'Nikhil Jain',         email: 'nikhil.jain@valueresearch.in',         dept: 'Research',            title: 'Analyst',                  salary: 700000,  band: 'IC3', managerCode: 'HR-EMP-00001', phone: '+91-9810011022', hireDaysAgo: 180 },

  // ── TECHNOLOGY (12) ────────────────────────────────────────────────────────
  { code: 'HR-EMP-00003', name: 'Arjun Kapoor',        email: 'arjun.kapoor@valueresearch.in',        dept: 'Technology',          title: 'Tech Lead',                salary: 2200000, band: 'IC5', managerCode: 'HR-EMP-00029', phone: '+91-9810011003', hireDaysAgo: 1400 },
  { code: 'HR-EMP-00005', name: 'Rahul Verma',         email: 'rahul.verma@valueresearch.in',         dept: 'Technology',          title: 'Software Engineer',        salary: 1000000, band: 'IC3', managerCode: 'HR-EMP-00003', phone: '+91-9810011005', hireDaysAgo: 500 },
  { code: 'HR-EMP-00023', name: 'Aman Srivastava',     email: 'aman.srivastava@valueresearch.in',     dept: 'Technology',          title: 'Senior Software Engineer', salary: 1600000, band: 'IC4', managerCode: 'HR-EMP-00003', phone: '+91-9810011023', hireDaysAgo: 900 },
  { code: 'HR-EMP-00024', name: 'Divya Pandey',        email: 'divya.pandey@valueresearch.in',        dept: 'Technology',          title: 'Software Engineer',        salary: 1000000, band: 'IC3', managerCode: 'HR-EMP-00003', phone: '+91-9810011024', hireDaysAgo: 420 },
  { code: 'HR-EMP-00025', name: 'Rohan Mishra',        email: 'rohan.mishra@valueresearch.in',        dept: 'Technology',          title: 'Senior Software Engineer', salary: 1600000, band: 'IC4', managerCode: 'HR-EMP-00003', phone: '+91-9810011025', hireDaysAgo: 800 },
  { code: 'HR-EMP-00026', name: 'Preeti Chaturvedi',   email: 'preeti.chaturvedi@valueresearch.in',   dept: 'Technology',          title: 'Software Engineer',        salary: 1000000, band: 'IC3', managerCode: 'HR-EMP-00029', phone: '+91-9810011026', hireDaysAgo: 300 },
  { code: 'HR-EMP-00027', name: 'Akash Dubey',         email: 'akash.dubey@valueresearch.in',         dept: 'Technology',          title: 'Senior Software Engineer', salary: 1600000, band: 'IC4', managerCode: 'HR-EMP-00029', phone: '+91-9810011027', hireDaysAgo: 700 },
  { code: 'HR-EMP-00028', name: 'Kritika Singh',       email: 'kritika.singh@valueresearch.in',       dept: 'Technology',          title: 'Software Engineer',        salary: 1000000, band: 'IC3', managerCode: 'HR-EMP-00029', phone: '+91-9810011028', hireDaysAgo: 250, status: 'on_leave' },
  { code: 'HR-EMP-00029', name: 'Manish Kumar',        email: 'manish.kumar@valueresearch.in',        dept: 'Technology',          title: 'Engineering Manager',      salary: 2800000, band: 'L4',  managerCode: 'HR-EMP-00065', phone: '+91-9810011029', hireDaysAgo: 1600 },
  { code: 'HR-EMP-00030', name: 'Payal Shah',          email: 'payal.shah@valueresearch.in',          dept: 'Technology',          title: 'Senior Software Engineer', salary: 1600000, band: 'IC4', managerCode: 'HR-EMP-00003', phone: '+91-9810011030', hireDaysAgo: 650 },
  { code: 'HR-EMP-00031', name: 'Gaurav Rastogi',      email: 'gaurav.rastogi@valueresearch.in',      dept: 'Technology',          title: 'Software Engineer',        salary: 1000000, band: 'IC3', managerCode: 'HR-EMP-00003', phone: '+91-9810011031', hireDaysAgo: 280 },
  { code: 'HR-EMP-00032', name: 'Ankita Bansal',       email: 'ankita.bansal@valueresearch.in',       dept: 'Technology',          title: 'Senior Software Engineer', salary: 1600000, band: 'IC4', managerCode: 'HR-EMP-00029', phone: '+91-9810011032', hireDaysAgo: 720 },

  // ── EDITORIAL (9) ──────────────────────────────────────────────────────────
  { code: 'HR-EMP-00004', name: 'Sneha Gupta',         email: 'sneha.gupta@valueresearch.in',         dept: 'Editorial',           title: 'Senior Editor',            salary: 1300000, band: 'IC5', managerCode: 'HR-EMP-00064', phone: '+91-9810011004', hireDaysAgo: 1500 },
  { code: 'HR-EMP-00033', name: 'Aditi Goswami',       email: 'aditi.goswami@valueresearch.in',       dept: 'Editorial',           title: 'Content Writer',           salary: 700000,  band: 'IC3', managerCode: 'HR-EMP-00034', phone: '+91-9810011033', hireDaysAgo: 200 },
  { code: 'HR-EMP-00034', name: 'Rahul Saxena',        email: 'rahul.saxena@valueresearch.in',        dept: 'Editorial',           title: 'Editor',                   salary: 1000000, band: 'IC4', managerCode: 'HR-EMP-00004', phone: '+91-9810011034', hireDaysAgo: 600 },
  { code: 'HR-EMP-00035', name: 'Meghna Joshi',        email: 'meghna.joshi@valueresearch.in',        dept: 'Editorial',           title: 'Content Writer',           salary: 700000,  band: 'IC3', managerCode: 'HR-EMP-00034', phone: '+91-9810011035', hireDaysAgo: 180 },
  { code: 'HR-EMP-00036', name: 'Tarun Verma',         email: 'tarun.verma@valueresearch.in',         dept: 'Editorial',           title: 'Senior Editor',            salary: 1300000, band: 'IC5', managerCode: 'HR-EMP-00004', phone: '+91-9810011036', hireDaysAgo: 900 },
  { code: 'HR-EMP-00037', name: 'Shweta Pillai',       email: 'shweta.pillai@valueresearch.in',       dept: 'Editorial',           title: 'Editor',                   salary: 1000000, band: 'IC4', managerCode: 'HR-EMP-00004', phone: '+91-9810011037', hireDaysAgo: 450 },
  { code: 'HR-EMP-00038', name: 'Abhijit Das',         email: 'abhijit.das@valueresearch.in',         dept: 'Editorial',           title: 'Content Writer',           salary: 700000,  band: 'IC3', managerCode: 'HR-EMP-00036', phone: '+91-9810011038', hireDaysAgo: 220 },
  { code: 'HR-EMP-00039', name: 'Renu Nair',           email: 'renu.nair@valueresearch.in',           dept: 'Editorial',           title: 'Senior Editor',            salary: 1300000, band: 'IC5', managerCode: 'HR-EMP-00004', phone: '+91-9810011039', hireDaysAgo: 800 },
  { code: 'HR-EMP-00040', name: 'Vishal Thakur',       email: 'vishal.thakur@valueresearch.in',       dept: 'Editorial',           title: 'Editor',                   salary: 1000000, band: 'IC4', managerCode: 'HR-EMP-00036', phone: '+91-9810011040', hireDaysAgo: 350 },

  // ── PRODUCT (6) ────────────────────────────────────────────────────────────
  { code: 'HR-EMP-00006', name: 'Ananya Singh',        email: 'ananya.singh@valueresearch.in',        dept: 'Product',             title: 'Product Manager',          salary: 1500000, band: 'IC4', managerCode: 'HR-EMP-00041', phone: '+91-9810011006', hireDaysAgo: 1000 },
  { code: 'HR-EMP-00041', name: 'Shruti Kapoor',       email: 'shruti.kapoor@valueresearch.in',       dept: 'Product',             title: 'Senior Product Manager',   salary: 2000000, band: 'IC5', managerCode: 'HR-EMP-00064', phone: '+91-9810011041', hireDaysAgo: 1300 },
  { code: 'HR-EMP-00042', name: 'Harsh Agarwal',       email: 'harsh.agarwal@valueresearch.in',       dept: 'Product',             title: 'Product Manager',          salary: 1500000, band: 'IC4', managerCode: 'HR-EMP-00041', phone: '+91-9810011042', hireDaysAgo: 550 },
  { code: 'HR-EMP-00043', name: 'Pallavi Misra',       email: 'pallavi.misra@valueresearch.in',       dept: 'Product',             title: 'Product Manager',          salary: 1500000, band: 'IC4', managerCode: 'HR-EMP-00041', phone: '+91-9810011043', hireDaysAgo: 480 },
  { code: 'HR-EMP-00044', name: 'Sumit Bhatia',        email: 'sumit.bhatia@valueresearch.in',        dept: 'Product',             title: 'Senior Product Manager',   salary: 2000000, band: 'IC5', managerCode: 'HR-EMP-00041', phone: '+91-9810011044', hireDaysAgo: 1100 },
  { code: 'HR-EMP-00045', name: 'Jyoti Arora',         email: 'jyoti.arora@valueresearch.in',         dept: 'Product',             title: 'Product Manager',          salary: 1500000, band: 'IC4', managerCode: 'HR-EMP-00041', phone: '+91-9810011045', hireDaysAgo: 320 },

  // ── DATA & ANALYTICS (6) ───────────────────────────────────────────────────
  { code: 'HR-EMP-00007', name: 'Vikram Joshi',        email: 'vikram.joshi@valueresearch.in',        dept: 'Data & Analytics',    title: 'Data Scientist',           salary: 1500000, band: 'IC5', managerCode: 'HR-EMP-00064', phone: '+91-9810011007', hireDaysAgo: 1350 },
  { code: 'HR-EMP-00046', name: 'Pranav Sinha',        email: 'pranav.sinha@valueresearch.in',        dept: 'Data & Analytics',    title: 'Data Analyst',             salary: 1100000, band: 'IC4', managerCode: 'HR-EMP-00007', phone: '+91-9810011046', hireDaysAgo: 400 },
  { code: 'HR-EMP-00047', name: 'Tanvi Kulkarni',      email: 'tanvi.kulkarni@valueresearch.in',      dept: 'Data & Analytics',    title: 'Data Scientist',           salary: 1500000, band: 'IC5', managerCode: 'HR-EMP-00007', phone: '+91-9810011047', hireDaysAgo: 700 },
  { code: 'HR-EMP-00048', name: 'Ajay Menon',          email: 'ajay.menon@valueresearch.in',          dept: 'Data & Analytics',    title: 'Senior Analyst',           salary: 1300000, band: 'IC4', managerCode: 'HR-EMP-00007', phone: '+91-9810011048', hireDaysAgo: 600 },
  { code: 'HR-EMP-00049', name: 'Neha Deshpande',      email: 'neha.deshpande@valueresearch.in',      dept: 'Data & Analytics',    title: 'Data Analyst',             salary: 1100000, band: 'IC4', managerCode: 'HR-EMP-00007', phone: '+91-9810011049', hireDaysAgo: 350 },
  { code: 'HR-EMP-00050', name: 'Vivek Yadav',         email: 'vivek.yadav@valueresearch.in',         dept: 'Data & Analytics',    title: 'Data Scientist',           salary: 1500000, band: 'IC5', managerCode: 'HR-EMP-00007', phone: '+91-9810011050', hireDaysAgo: 750 },

  // ── SUBSCRIBER SERVICES (6) ────────────────────────────────────────────────
  { code: 'HR-EMP-00010', name: 'Meera Pillai',        email: 'meera.pillai@valueresearch.in',        dept: 'Subscriber Services', title: 'Manager',                  salary: 1800000, band: 'L4',  managerCode: 'HR-EMP-00065', phone: '+91-9810011010', hireDaysAgo: 1200 },
  { code: 'HR-EMP-00051', name: 'Lavanya Krishnan',    email: 'lavanya.krishnan@valueresearch.in',    dept: 'Subscriber Services', title: 'Manager',                  salary: 1800000, band: 'L4',  managerCode: 'HR-EMP-00010', phone: '+91-9810011051', hireDaysAgo: 800 },
  { code: 'HR-EMP-00052', name: 'Rajat Chauhan',       email: 'rajat.chauhan@valueresearch.in',       dept: 'Subscriber Services', title: 'Senior Analyst',           salary: 1300000, band: 'IC4', managerCode: 'HR-EMP-00010', phone: '+91-9810011052', hireDaysAgo: 500 },
  { code: 'HR-EMP-00053', name: 'Seema Patel',         email: 'seema.patel@valueresearch.in',         dept: 'Subscriber Services', title: 'Analyst',                  salary: 700000,  band: 'IC3', managerCode: 'HR-EMP-00051', phone: '+91-9810011053', hireDaysAgo: 280 },
  { code: 'HR-EMP-00054', name: 'Ankit Gupta',         email: 'ankit.gupta@valueresearch.in',         dept: 'Subscriber Services', title: 'Analyst',                  salary: 700000,  band: 'IC3', managerCode: 'HR-EMP-00051', phone: '+91-9810011054', hireDaysAgo: 240 },
  { code: 'HR-EMP-00055', name: 'Shilpa Nanda',        email: 'shilpa.nanda@valueresearch.in',        dept: 'Subscriber Services', title: 'Senior Analyst',           salary: 1300000, band: 'IC4', managerCode: 'HR-EMP-00010', phone: '+91-9810011055', hireDaysAgo: 650 },

  // ── ACCOUNTS (4) ───────────────────────────────────────────────────────────
  { code: 'HR-EMP-00009', name: 'Rohan Agarwal',       email: 'rohan.agarwal@valueresearch.in',       dept: 'Accounts',            title: 'Finance Manager',          salary: 2000000, band: 'IC5', managerCode: 'HR-EMP-00058', phone: '+91-9810011009', hireDaysAgo: 1100 },
  { code: 'HR-EMP-00056', name: 'Suresh Bajaj',        email: 'suresh.bajaj@valueresearch.in',        dept: 'Accounts',            title: 'Finance Executive',        salary: 750000,  band: 'IC3', managerCode: 'HR-EMP-00009', phone: '+91-9810011056', hireDaysAgo: 400 },
  { code: 'HR-EMP-00057', name: 'Archana Patil',       email: 'archana.patil@valueresearch.in',       dept: 'Accounts',            title: 'Finance Executive',        salary: 750000,  band: 'IC3', managerCode: 'HR-EMP-00009', phone: '+91-9810011057', hireDaysAgo: 350 },
  { code: 'HR-EMP-00058', name: 'Vikash Agrawal',      email: 'vikash.agrawal@valueresearch.in',      dept: 'Accounts',            title: 'Senior Manager',           salary: 2200000, band: 'L4',  managerCode: 'HR-EMP-00065', phone: '+91-9810011058', hireDaysAgo: 1400 },

  // ── HUMAN RESOURCES (3) ────────────────────────────────────────────────────
  { code: 'HR-EMP-00008', name: 'Kavya Nair',          email: 'kavya.nair@valueresearch.in',          dept: 'Human Resources',     title: 'HR Manager',               salary: 1800000, band: 'L4',  managerCode: 'HR-EMP-00065', phone: '+91-9810011008', hireDaysAgo: 1300 },
  { code: 'HR-EMP-00059', name: 'Priyanka Rawat',      email: 'priyanka.rawat@valueresearch.in',      dept: 'Human Resources',     title: 'HR Executive',             salary: 650000,  band: 'IC3', managerCode: 'HR-EMP-00008', phone: '+91-9810011059', hireDaysAgo: 300 },
  { code: 'HR-EMP-00060', name: 'Mohit Sharma',        email: 'mohit.sharma@valueresearch.in',        dept: 'Human Resources',     title: 'HR Executive',             salary: 650000,  band: 'IC3', managerCode: 'HR-EMP-00008', phone: '+91-9810011060', hireDaysAgo: 260 },

  // ── LEGAL (2) ──────────────────────────────────────────────────────────────
  { code: 'HR-EMP-00061', name: 'Sangeeta Rao',        email: 'sangeeta.rao@valueresearch.in',        dept: 'Legal',               title: 'Senior Manager',           salary: 2200000, band: 'L4',  managerCode: 'HR-EMP-00063', phone: '+91-9810011061', hireDaysAgo: 1500 },
  { code: 'HR-EMP-00062', name: 'Abhishek Tomar',      email: 'abhishek.tomar@valueresearch.in',      dept: 'Legal',               title: 'Manager',                  salary: 1800000, band: 'L4',  managerCode: 'HR-EMP-00061', phone: '+91-9810011062', hireDaysAgo: 800 },

  // ── MANAGEMENT (3) ─────────────────────────────────────────────────────────
  { code: 'HR-EMP-00063', name: 'Dhirendra Swarup',    email: 'dhirendra.swarup@valueresearch.in',    dept: 'Management',          title: 'Director',                 salary: 6000000, band: 'L5',  managerCode: null,           phone: '+91-9810011063', hireDaysAgo: 2500 },
  { code: 'HR-EMP-00064', name: 'Radhika Sharma',      email: 'radhika.sharma@valueresearch.in',      dept: 'Management',          title: 'Vice President',           salary: 4500000, band: 'L5',  managerCode: 'HR-EMP-00063', phone: '+91-9810011064', hireDaysAgo: 2000 },
  { code: 'HR-EMP-00065', name: 'Sameer Kapoor',       email: 'sameer.kapoor@valueresearch.in',       dept: 'Management',          title: 'Associate Vice President', salary: 3500000, band: 'L5',  managerCode: 'HR-EMP-00063', phone: '+91-9810011065', hireDaysAgo: 1800 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function rand<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function ri(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function rf(min: number, max: number) { return parseFloat((Math.random() * (max - min) + min).toFixed(4)); }

const LTYPES = ['annual', 'sick', 'compensatory'] as const;

// ── Main ──────────────────────────────────────────────────────────────────────

export async function seedDatabase(): Promise<void> {
  await connectDB();
  registerGlobalTenantPlugin();

  // 0. Clear all workspace + tenant collections
  const db = mongoose.connection.db!;
  await Promise.all([
    db.collection('tenants').deleteMany({}),
    db.collection('users').deleteMany({}),
    db.collection('ws_departments').deleteMany({}),
    db.collection('ws_employees').deleteMany({}),
    db.collection('ws_leave_requests').deleteMany({}),
    db.collection('ws_payroll_runs').deleteMany({}),
    db.collection('ws_audit_trail').deleteMany({}),
    db.collection('ws_notification_logs').deleteMany({}),
    db.collection('ws_performance_reviews').deleteMany({}),
    db.collection('ws_inapp_notifications').deleteMany({}),
    db.collection('ws_compensation_history').deleteMany({}),
    db.collection('ws_goals').deleteMany({}),
    db.collection('ws_leave_balances').deleteMany({}),
    db.collection('ws_onboarding').deleteMany({}),
  ]);
  console.info('✓ Cleared all workspace collections');

  // 1. Create Tenant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = await (Tenant as any).create({
    slug:            'value-research',
    legalName:       'Value Research India Pvt. Ltd.',
    primaryCountry:  'IN',
    primaryCurrency: 'INR',
    kmsConfig:    { provider: 'local', masterKeyId: 'local-dev-key', keyAltName: 'vr-dek-v1' },
    subscription: { tier: 'enterprise', maxSeats: 2000, usedSeats: 0, features: ['payroll', 'performance', 'analytics', 'immigration'] },
    ztPolicy:     { deviceComplianceRequired: true, heartbeatIntervalSeconds: 300, autoRevokeOnNonCompliance: true },
    isActive: true,
  });
  const tenantId  = (tenant._id as mongoose.Types.ObjectId).toString();
  const tenantOid = new mongoose.Types.ObjectId(tenantId);
  console.info(`✓ Created tenant: ${tenant.slug} (${tenantId})`);

  // 2. Seed inside TenantContext
  await TenantContext.run({
    tenantId:    tenantOid,
    userId:      new mongoose.Types.ObjectId('000000000000000000000000'),
    userRole:    'super_admin',
    employeeId:  null,
    deviceTrust: 'trusted',
    requestId:   'seed-run',
    createdAt:   new Date(),
  }, async () => {

    // ── Departments ───────────────────────────────────────────────────────────
    const depts = await WorkspaceDepartment.insertMany(
      DEPTS.map((d) => ({ ...d, tenantId: tenantOid, headCount: 0 }))
    );
    const deptByName = new Map(depts.map((d) => [d.name, d]));
    console.info(`✓ Seeded ${depts.length} departments`);

    // ── Employees (65, AES-256-GCM encrypted) ────────────────────────────────
    const empDocs = [];
    for (const f of VR_EMPLOYEES) {
      const dept     = deptByName.get(f.dept)!;
      const hireDate = new Date(Date.now() - f.hireDaysAgo * 86_400_000);
      const enc = await encryptEmployeeFields(tenantId, {
        fullName:   f.name,
        email:      f.email,
        phone:      f.phone,
        baseSalary: f.salary,
      });
      empDocs.push({
        tenantId:         tenantOid,
        employeeCode:     f.code,
        ...enc,
        currencyCode:     'INR',
        salaryBand:       f.band,
        departmentId:     dept._id as mongoose.Types.ObjectId,
        departmentName:   dept.name,
        departmentCode:   dept.code,
        jobTitle:         f.title,
        hireDate,
        hireDateMonth:    hireDate.getMonth() + 1,
        hireDateDay:      hireDate.getDate(),
        countryCode:      'IN',
        employeeStatus:   (f.status ?? 'active') as string,
        employmentType:   'full_time',
        timezone:         'Asia/Kolkata',
        locale:           'en-IN',
        burnoutRiskScore: rf(0.05, 0.85),
        flightRiskScore:  rf(0.05, 0.75),
        engagementPct:    parseFloat(rf(40, 95).toFixed(2)),
        riskComputedAt:   new Date(),
        isActive:         true,
      });
    }
    const employees = await WorkspaceEmployee.insertMany(empDocs);
    console.info(`✓ Seeded ${employees.length} encrypted employees`);

    // Build lookup: employeeCode → inserted document
    const empByCode = new Map(employees.map((e) => [e.employeeCode, e]));

    // ── Reporting chains ──────────────────────────────────────────────────────
    for (const f of VR_EMPLOYEES) {
      if (!f.managerCode) continue;
      const emp = empByCode.get(f.code)!;
      const mgr = empByCode.get(f.managerCode)!;
      await db.collection('ws_employees').updateOne(
        { _id: emp._id as mongoose.Types.ObjectId },
        { $set: { managerId: mgr._id as mongoose.Types.ObjectId, managerName: mgr.employeeCode } },
      );
    }
    console.info('✓ Set up reporting chains');

    // Update dept headcounts
    for (const d of depts) {
      const n = await WorkspaceEmployee.countDocuments({ departmentId: d._id });
      await WorkspaceDepartment.findByIdAndUpdate(d._id, { headCount: n });
    }

    // ── Demo employee references ──────────────────────────────────────────────
    // emp0    = Dhruv Mehta (HR-EMP-00001)     → "employee" login
    // mgrEmp  = Priya Sharma (HR-EMP-00002)    → direct manager / recommender
    // dirEmp  = Radhika Sharma (HR-EMP-00064)  → VP / skip-level endorser
    // leadEmp = Arjun Kapoor (HR-EMP-00003)    → Tech Lead, employee-role user with direct reports
    const emp0    = empByCode.get('HR-EMP-00001')!;
    const mgrEmp  = empByCode.get('HR-EMP-00002')!;
    const dirEmp  = empByCode.get('HR-EMP-00064')!;
    const leadEmp = empByCode.get('HR-EMP-00003')!;

    // Enrich demo employee with skills / assets / equity
    await db.collection('ws_employees').updateOne(
      { _id: emp0._id as mongoose.Types.ObjectId },
      { $set: {
        burnoutRiskScore: 0.28,
        flightRiskScore:  0.18,
        engagementPct:    84,
        skills: [
          { skillSlug: 'equity-research', skillName: 'Equity Research',     proficiency: 'expert',       verifiedVia: 'peer_review_360', endorsementCount: 14, lastAssessedAt: new Date() },
          { skillSlug: 'financial-model', skillName: 'Financial Modelling',  proficiency: 'expert',       verifiedVia: 'manager',         endorsementCount: 9,  lastAssessedAt: new Date() },
          { skillSlug: 'python',          skillName: 'Python',               proficiency: 'practitioner', verifiedVia: 'certification',   endorsementCount: 6,  lastAssessedAt: new Date() },
          { skillSlug: 'stakeholder',     skillName: 'Stakeholder Mgmt',     proficiency: 'working',      verifiedVia: 'self',            endorsementCount: 3,  lastAssessedAt: new Date() },
        ],
        provisionedAssets: [
          { assetId: new mongoose.Types.ObjectId(), assetCategory: 'laptop',  provider: 'Apple MacBook Pro 14"', state: 'provisioned' },
          { assetId: new mongoose.Types.ObjectId(), assetCategory: 'license', provider: 'Bloomberg Terminal',    state: 'provisioned' },
          { assetId: new mongoose.Types.ObjectId(), assetCategory: 'phone',   provider: 'iPhone 15',             state: 'provisioned' },
        ],
        vestingSchedules: [
          { grantId: 'ESOP-2023-0001', grantType: 'rsu', totalUnits: 3000, vestedUnits: 1500, unvestedUnits: 1500, status: 'active', vestingScheduleType: 'graded', vestingPeriodMonths: 48, currencyCode: 'INR', grantDate: new Date('2023-01-01'), cliffDate: new Date('2024-01-01'), fullyVestedDate: new Date('2027-01-01') },
        ],
      } },
    );

    // ── Users (6 demo login accounts) ─────────────────────────────────────────
    // Super Admin  → Dhirendra Swarup  (Director)       VR@00063
    // HR Admin     → Kavya Nair        (HR Manager)     VR@00008
    // HR Manager 1 → Priya Sharma      (Fund Mgr)       VR@00002  ← direct mgr / recommender
    // HR Manager 2 → Radhika Sharma    (VP)             VR@00064  ← skip-level endorser
    // Employee TL  → Arjun Kapoor      (Tech Lead)      VR@00003  ← has direct reports
    // Employee     → Dhruv Mehta       (Sr RA)          VR@00001  ← demo account
    const mgrUserId  = new mongoose.Types.ObjectId();
    const dirUserId  = new mongoose.Types.ObjectId();
    const leadUserId = new mongoose.Types.ObjectId();
    const [hashSuper, hashHR, hashMgr, hashDir, hashLead, hashEmp] = await Promise.all([
      bcrypt.hash('VR@00063', 12),
      bcrypt.hash('VR@00008', 12),
      bcrypt.hash('VR@00002', 12),
      bcrypt.hash('VR@00064', 12),
      bcrypt.hash('VR@00003', 12),
      bcrypt.hash('VR@00001', 12),
    ]);
    const now      = new Date();
    const kavyaEmp = empByCode.get('HR-EMP-00008')!;
    const dhirEmp  = empByCode.get('HR-EMP-00063')!;
    await db.collection('users').insertMany([
      {                  name: 'Dhirendra Swarup', email: 'dhirendra.swarup@valueresearch.in', password: hashSuper, role: 'super_admin', tenantId: tenantOid, employeeId: dhirEmp._id  as mongoose.Types.ObjectId, isActive: true, createdAt: now, updatedAt: now },
      {                  name: 'Kavya Nair',        email: 'kavya.nair@valueresearch.in',       password: hashHR,    role: 'hr_admin',    tenantId: tenantOid, employeeId: kavyaEmp._id as mongoose.Types.ObjectId, isActive: true, createdAt: now, updatedAt: now },
      { _id: mgrUserId,  name: 'Priya Sharma',      email: 'priya.sharma@valueresearch.in',     password: hashMgr,   role: 'hr_manager',  tenantId: tenantOid, employeeId: mgrEmp._id   as mongoose.Types.ObjectId, isActive: true, createdAt: now, updatedAt: now },
      { _id: dirUserId,  name: 'Radhika Sharma',    email: 'radhika.sharma@valueresearch.in',   password: hashDir,   role: 'hr_manager',  tenantId: tenantOid, employeeId: dirEmp._id   as mongoose.Types.ObjectId, isActive: true, createdAt: now, updatedAt: now },
      { _id: leadUserId, name: 'Arjun Kapoor',      email: 'arjun.kapoor@valueresearch.in',     password: hashLead,  role: 'hr_manager',  tenantId: tenantOid, employeeId: leadEmp._id  as mongoose.Types.ObjectId, isActive: true, createdAt: now, updatedAt: now },
      {                  name: 'Dhruv Mehta',       email: 'dhruv.mehta@valueresearch.in',      password: hashEmp,   role: 'employee',    tenantId: tenantOid, employeeId: emp0._id     as mongoose.Types.ObjectId, isActive: true, createdAt: now, updatedAt: now },
    ]);

    await Tenant.findByIdAndUpdate(tenantOid, { 'subscription.usedSeats': employees.length });

    console.info('✓ Seeded 6 users:');
    console.info('   dhirendra.swarup@valueresearch.in / VR@00063 → SUPER_ADMIN (Director)');
    console.info('   kavya.nair@valueresearch.in       / VR@00008 → HR_ADMIN    (HR Manager)');
    console.info('   priya.sharma@valueresearch.in     / VR@00002 → HR_MANAGER  (Fund Manager, direct mgr)');
    console.info('   radhika.sharma@valueresearch.in   / VR@00064 → HR_MANAGER  (VP, skip-level)');
    console.info('   arjun.kapoor@valueresearch.in     / VR@00003 → HR_MANAGER  (Tech Lead, has reports)');
    console.info('   dhruv.mehta@valueresearch.in      / VR@00001 → EMPLOYEE    (demo account)');

    // ── Leave balances for demo team ──────────────────────────────────────────
    const currentYear = new Date().getFullYear();
    const leavBalDocs = [
      { employeeId: emp0._id,                               annual: 21, sick: 12, earned: 5,  used: 4,  remaining: 17 },
      { employeeId: mgrEmp._id,                             annual: 24, sick: 12, earned: 5,  used: 7,  remaining: 17 },
      { employeeId: dirEmp._id,                             annual: 30, sick: 12, earned: 10, used: 3,  remaining: 27 },
      { employeeId: leadEmp._id,                            annual: 21, sick: 12, earned: 5,  used: 5,  remaining: 16 },
      { employeeId: empByCode.get('HR-EMP-00013')!._id,     annual: 21, sick: 12, earned: 3,  used: 9,  remaining: 12 },
      { employeeId: empByCode.get('HR-EMP-00023')!._id,     annual: 21, sick: 12, earned: 5,  used: 2,  remaining: 19 },
      { employeeId: empByCode.get('HR-EMP-00029')!._id,     annual: 24, sick: 12, earned: 5,  used: 6,  remaining: 18 },
    ].map((b) => ({ tenantId: tenantOid, year: currentYear, ...b, createdAt: new Date(), updatedAt: new Date() }));
    await db.collection('ws_leave_balances').insertMany(leavBalDocs);
    console.info('✓ Seeded leave balances for 7 demo members');

    // ── Leave requests (30) ───────────────────────────────────────────────────
    const historicalStatuses = ['approved', 'approved', 'approved', 'rejected'] as const;
    const leaveDocs: object[] = [];

    leaveDocs.push({
      tenantId: tenantOid, employeeId: emp0._id as mongoose.Types.ObjectId,
      leaveType: 'annual', reason: 'Family trip to Goa',
      startDate: new Date(Date.now() - 45 * 86_400_000),
      endDate:   new Date(Date.now() - 41 * 86_400_000),
      totalDays: 4, status: 'approved',
      approvedById: mgrEmp._id as mongoose.Types.ObjectId, approvedAt: new Date(Date.now() - 50 * 86_400_000),
      createdAt: new Date(Date.now() - 52 * 86_400_000), updatedAt: new Date(),
    });
    leaveDocs.push({
      tenantId: tenantOid, employeeId: emp0._id as mongoose.Types.ObjectId,
      leaveType: 'sick', reason: 'Viral fever',
      startDate: new Date(Date.now() - 20 * 86_400_000),
      endDate:   new Date(Date.now() - 19 * 86_400_000),
      totalDays: 2, status: 'rejected',
      rejectionReason: 'Insufficient notice. Please resubmit with a medical certificate.',
      createdAt: new Date(Date.now() - 22 * 86_400_000), updatedAt: new Date(),
    });
    leaveDocs.push({
      tenantId: tenantOid, employeeId: emp0._id as mongoose.Types.ObjectId,
      leaveType: 'annual', reason: 'Wedding anniversary trip',
      startDate: new Date(Date.now() + 14 * 86_400_000),
      endDate:   new Date(Date.now() + 17 * 86_400_000),
      totalDays: 3, status: 'pending',
      createdAt: new Date(Date.now() - 1 * 86_400_000), updatedAt: new Date(),
    });

    Array.from({ length: 27 }, () => {
      const emp    = employees[Math.floor(Math.random() * employees.length)]!;
      const days   = ri(1, 5);
      const start  = new Date(Date.now() - ri(10, 90) * 86_400_000);
      const end    = new Date(start.getTime() + days * 86_400_000);
      const status = rand(historicalStatuses);
      leaveDocs.push({
        tenantId: tenantOid, employeeId: emp._id as mongoose.Types.ObjectId,
        leaveType: rand(LTYPES), startDate: start, endDate: end,
        totalDays: days, reason: 'Personal reason', status,
        createdAt: new Date(start.getTime() - ri(1, 3) * 86_400_000), updatedAt: new Date(),
        ...(status === 'approved' ? {
          approvedById: mgrEmp._id as mongoose.Types.ObjectId,
          approvedAt:   new Date(start.getTime() - 86_400_000),
        } : {}),
      });
    });
    await db.collection('ws_leave_requests').insertMany(leaveDocs);
    console.info('✓ Seeded 30 leave requests (Dhruv: 1 pending + 1 approved + 1 rejected)');

    // ── Payroll run (current month) ───────────────────────────────────────────
    const payrollNow = new Date();
    const active     = employees.filter((e) => e.employeeStatus === 'active');
    const { key: dekKey } = await getTenantDEK(tenantId);

    const encNum = (n: number): Buffer => {
      const { createCipheriv, randomBytes } = require('node:crypto') as typeof import('node:crypto');
      const iv  = randomBytes(12);
      const c   = createCipheriv('aes-256-gcm', dekKey, iv);
      const b   = Buffer.concat([c.update(String(n), 'utf8'), c.final()]);
      const tag = c.getAuthTag();
      return Buffer.concat([Buffer.from([0x01]), iv, tag, b]);
    };

    // Average monthly salary: ~₹1.5L/mo per employee
    const grossEst = active.length * 150_000;
    const dedEst   = Math.round(grossEst * 0.20); // TDS + PF approx
    const netEst   = grossEst - dedEst;

    await db.collection('ws_payroll_runs').insertOne({
      tenantId:           tenantOid,
      runCode:            `PAY-${payrollNow.getFullYear()}-${String(payrollNow.getMonth() + 1).padStart(2, '0')}-001`,
      payPeriodMonth:     payrollNow.getMonth() + 1,
      payPeriodYear:      payrollNow.getFullYear(),
      currencyCode:       'INR',
      runStatus:          'draft',
      totalGrossEnc:      encNum(grossEst),
      totalNetEnc:        encNum(netEst),
      totalDeductionsEnc: encNum(dedEst),
      employeeCount:      active.length,
      criticalFlagCount:  0,
      auditFlags:         [],
      lineItems: active.map((e) => ({
        employeeId:     e._id as mongoose.Types.ObjectId,
        employeeCode:   e.employeeCode,
        currencyCode:   'INR',
        baseSalaryEnc:  e.baseSalaryEnc,
        grossSalaryEnc: e.baseSalaryEnc,
        netSalaryEnc:   e.baseSalaryEnc,
        lineHash:       createHash('sha256').update(e.employeeCode + payrollNow.toISOString()).digest('hex'),
      })),
      createdAt: payrollNow, updatedAt: payrollNow,
    });
    console.info(`✓ Seeded payroll run (${active.length} active employees)`);

    // ── Performance reviews ───────────────────────────────────────────────────
    const buildCompetencies = (self?: number[], mgr?: number[]) =>
      PERF_COMPETENCIES.map((c, i) => ({
        key: c.key, label: c.label,
        ...(self ? { selfRating: self[i], selfComment: '' } : {}),
        ...(mgr  ? { managerRating: mgr[i], managerComment: '' } : {}),
      }));

    const H1 = { cycleLabel: 'H1 2026', periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-06-30') };
    const H2 = { cycleLabel: 'H2 2025', periodStart: new Date('2025-07-01'), periodEnd: new Date('2025-12-31') };
    const reviewBase = {
      tenantId: tenantOid, isActive: true, goals: [] as object[],
      compensation: { recommended: false, promotion: false, incrementPct: 0, decision: 'none' },
    };
    const empMeta = (e: typeof emp0) => ({
      employeeId:     e._id as mongoose.Types.ObjectId,
      employeeCode:   e.employeeCode,
      jobTitle:       e.jobTitle,
      departmentName: e.departmentName,
    });

    // secondary employees for the HR review pipeline
    const rKaran  = empByCode.get('HR-EMP-00013')!; // Karan Malhotra
    const rAman   = empByCode.get('HR-EMP-00023')!; // Aman Srivastava
    const rAnanya = empByCode.get('HR-EMP-00006')!; // Ananya Singh
    const rTanvi  = empByCode.get('HR-EMP-00047')!; // Tanvi Kulkarni

    const reviewDocs: object[] = [
      // Dhruv Mehta — current cycle, open for self-assessment
      {
        ...reviewBase, ...empMeta(emp0), ...H1,
        status: 'self_assessment',
        competencies: buildCompetencies(),
        selfAssessment: {}, managerReview: {}, employeeAck: { acknowledged: false },
        createdAt: new Date(Date.now() - 2 * 86_400_000), updatedAt: new Date(),
      },
      // Dhruv Mehta — past acknowledged review
      {
        ...reviewBase, ...empMeta(emp0), ...H2,
        status: 'acknowledged',
        competencies: buildCompetencies([4, 5, 3, 4, 4], [4, 4, 4, 5, 4]),
        selfAssessment: {
          summary:      'Delivered 14 sector reports ahead of schedule and mentored two junior analysts.',
          achievements: 'Published pharma and NBFC sector initiations; reports cited in 3 PMS notes.',
          challenges:   'Cross-team data dependencies slowed Q4 earnings coverage.',
          submittedAt:  new Date('2025-12-10'),
        },
        managerReview: {
          summary:         'Strong, dependable output and excellent mentoring. Clear top performer.',
          areasOfStrength: 'Research depth, ownership, calm under pressure.',
          areasToImprove:  'Delegate more; document key thesis earlier in the process.',
          overallRating:   4,
          submittedAt:     new Date('2025-12-18'),
        },
        overallRating: 4,
        employeeAck: { acknowledged: true, comment: 'Aligned with my own assessment — thank you.', acknowledgedAt: new Date('2025-12-20') },
        createdAt: new Date('2025-12-01'), updatedAt: new Date('2025-12-20'),
      },
      // Karan Malhotra — awaiting manager review
      {
        ...reviewBase, ...empMeta(rKaran), ...H1,
        status: 'manager_review',
        competencies: buildCompetencies([3, 4, 4, 3, 4]),
        selfAssessment: {
          summary:      'Steady contributor with growing scope in mid-cap coverage.',
          achievements: 'Initiated the NBFC sector report now used as a reference by the PMS team.',
          challenges:   'Balancing ad-hoc support requests with primary research.',
          submittedAt:  new Date(Date.now() - 5 * 86_400_000),
        },
        managerReview: {}, employeeAck: { acknowledged: false },
        createdAt: new Date(Date.now() - 9 * 86_400_000), updatedAt: new Date(),
      },
      // Aman Srivastava — awaiting manager review
      {
        ...reviewBase, ...empMeta(rAman), ...H1,
        status: 'manager_review',
        competencies: buildCompetencies([5, 4, 5, 5, 4]),
        selfAssessment: {
          summary:      'Led two major platform initiatives to completion ahead of deadline.',
          achievements: 'Built the fund screener feature now used by 30k+ subscribers.',
          challenges:   'Hiring delays stretched the team thin in Q1.',
          submittedAt:  new Date(Date.now() - 3 * 86_400_000),
        },
        managerReview: {}, employeeAck: { acknowledged: false },
        createdAt: new Date(Date.now() - 8 * 86_400_000), updatedAt: new Date(),
      },
      // Ananya Singh — finalized, pending 1-step comp (6% merit, no promotion)
      {
        ...reviewBase, ...empMeta(rAnanya), ...H1,
        status: 'finalized',
        competencies: buildCompetencies([4, 3, 4, 4, 3], [3, 3, 4, 4, 3]),
        selfAssessment: {
          summary:      'Reliable delivery with room to grow in stakeholder communication.',
          achievements: 'Shipped the revamped onboarding flow, improving subscriber retention 20%.',
          challenges:   'Context-switching across 3 concurrent product tracks.',
          submittedAt:  new Date(Date.now() - 12 * 86_400_000),
        },
        managerReview: {
          summary:         'Solid performance; focus next half on proactive stakeholder updates.',
          areasOfStrength: 'Execution and follow-through.',
          areasToImprove:  'Communication cadence with senior stakeholders.',
          overallRating:   3, submittedAt: new Date(Date.now() - 4 * 86_400_000),
        },
        overallRating: 3, employeeAck: { acknowledged: false },
        compensation: {
          recommended: true, recommendedById: mgrUserId, recommendedByEmpId: mgrEmp._id as mongoose.Types.ObjectId,
          recommendedByManager: true, recommenderRelationship: 'direct',
          recommendedAt: new Date(Date.now() - 4 * 86_400_000),
          promotion: false, incrementPct: 6, decision: 'pending',
          justification: 'Consistent delivery; market adjustment to retain talent.',
          requiresTwoStep: false, currentStep: 'hr',
          approvals: [{ step: 'hr', status: 'pending' }],
        },
        createdAt: new Date(Date.now() - 15 * 86_400_000), updatedAt: new Date(),
      },
      // Tanvi Kulkarni — finalized, pending 2-step (promotion + 15%)
      {
        ...reviewBase, ...empMeta(rTanvi), ...H1,
        status: 'finalized',
        competencies: buildCompetencies([5, 5, 4, 5, 5], [5, 4, 5, 5, 5]),
        selfAssessment: {
          summary:      'Exceptional half — exceeded every goal and led the ML pipeline revamp.',
          achievements: 'Built the fund-selection ML model that improved recommendation CTR by 32%.',
          challenges:   'None significant.',
          submittedAt:  new Date(Date.now() - 11 * 86_400_000),
        },
        managerReview: {
          summary:         'Outstanding impact and technical leadership. Clear promotion candidate.',
          areasOfStrength: 'ML depth, delivery, cross-team collaboration.',
          areasToImprove:  'Take on more mentoring of junior data analysts.',
          overallRating:   5, submittedAt: new Date(Date.now() - 3 * 86_400_000),
        },
        overallRating: 5, employeeAck: { acknowledged: false },
        compensation: {
          recommended: true, recommendedById: mgrUserId, recommendedByEmpId: mgrEmp._id as mongoose.Types.ObjectId,
          recommendedByManager: true, recommenderRelationship: 'direct',
          recommendedAt: new Date(Date.now() - 3 * 86_400_000),
          promotion: true, proposedTitle: 'Senior Data Scientist', proposedBand: 'L4',
          incrementPct: 15, decision: 'pending',
          justification: 'Top performer; promotion to Senior Data Scientist with market-leading increment.',
          requiresTwoStep: true, currentStep: 'skip_level',
          skipLevelManagerId: dirEmp._id as mongoose.Types.ObjectId,
          approvals: [{ step: 'skip_level', status: 'pending' }, { step: 'hr', status: 'pending' }],
        },
        createdAt: new Date(Date.now() - 14 * 86_400_000), updatedAt: new Date(),
      },
    ];
    await db.collection('ws_performance_reviews').insertMany(reviewDocs);
    console.info('✓ Seeded 6 performance reviews (Dhruv: 1 open + 1 acknowledged · 2 pending comp approvals)');

    // ── Goals / OKRs for Dhruv Mehta ─────────────────────────────────────────
    const goalNow = new Date();
    await db.collection('ws_goals').insertMany([
      {
        tenantId: tenantOid, employeeId: emp0._id as mongoose.Types.ObjectId, employeeCode: emp0.employeeCode,
        title: 'Publish 12 high-quality sector reports',
        description: 'Deep-dive coverage across assigned sectors with clear investment thesis.',
        category: 'business', cycleLabel: 'H1 2026', weight: 40, status: 'active', progressPct: 58,
        keyResults: [
          { title: 'Sector reports published',     targetValue: 12, currentValue: 7, unit: '',  done: false },
          { title: 'Reports cited by PMS team',    targetValue: 5,  currentValue: 3, unit: '',  done: false },
        ],
        checkIns: [
          { progressPct: 30, note: 'Covered NBFC and pharma sectors.',          at: new Date(goalNow.getTime() - 60 * 86_400_000) },
          { progressPct: 58, note: '7 reports published, Q2 pipeline on track.', at: new Date(goalNow.getTime() - 10 * 86_400_000) },
        ],
        createdById: emp0._id as mongoose.Types.ObjectId, isActive: true,
        createdAt: new Date(goalNow.getTime() - 75 * 86_400_000), updatedAt: goalNow,
      },
      {
        tenantId: tenantOid, employeeId: emp0._id as mongoose.Types.ObjectId, employeeCode: emp0.employeeCode,
        title: 'Mentor two junior research analysts',
        description: 'Run weekly 1:1s and structured ramp plans for Aditya Agarwal and Riya Bose.',
        category: 'people', cycleLabel: 'H1 2026', weight: 25, status: 'active', progressPct: 80,
        keyResults: [{ title: 'Weekly 1:1s held', targetValue: 24, currentValue: 19, unit: '', done: false }],
        checkIns: [{ progressPct: 80, note: 'Both analysts published their first independent coverage note.', at: new Date(goalNow.getTime() - 12 * 86_400_000) }],
        createdById: emp0._id as mongoose.Types.ObjectId, isActive: true,
        createdAt: new Date(goalNow.getTime() - 70 * 86_400_000), updatedAt: goalNow,
      },
      {
        tenantId: tenantOid, employeeId: emp0._id as mongoose.Types.ObjectId, employeeCode: emp0.employeeCode,
        title: 'Complete CFA Level III',
        description: 'Professional certification to strengthen portfolio management expertise.',
        category: 'personal', cycleLabel: 'H1 2026', weight: 15, status: 'achieved', progressPct: 100,
        keyResults: [{ title: 'Pass the exam', targetValue: 1, currentValue: 1, unit: '', done: true }],
        checkIns: [{ progressPct: 100, note: 'Passed CFA Level III in May 2026!', at: new Date(goalNow.getTime() - 5 * 86_400_000) }],
        createdById: emp0._id as mongoose.Types.ObjectId, isActive: true,
        createdAt: new Date(goalNow.getTime() - 80 * 86_400_000), updatedAt: goalNow,
      },
    ]);
    console.info('✓ Seeded 3 goals for Dhruv Mehta (H1 2026)');

    // ── Genesis audit entry ───────────────────────────────────────────────────
    const auditKey = createHmac('sha256', dekKey).update('audit-chain-key-v1').digest('hex');
    const newHash  = createHash('sha256').update(`seed:${tenantId}:${Date.now()}`).digest('hex');
    const auditSig = createHmac('sha256', auditKey).update(`${newHash}:GENESIS:${tenantId}`).digest('hex');
    await db.collection('ws_audit_trail').insertOne({
      tenantId:         tenantOid,
      actionType:       'INSERT',
      targetCollection: 'tenants',
      newStateHash:     newHash,
      previousHash:     null,
      digitalSignature: auditSig,
      sequenceNumber:   1,
      changeSummary:    { event: 'seed_completed', employeeCount: employees.length },
      createdAt:        new Date(),
    });
    console.info('✓ Seeded genesis audit entry');

    console.info('\n✅ Seed complete — Value Research HRMS ready.');
  });
}
